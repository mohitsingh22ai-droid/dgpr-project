import Papa from "papaparse";
import { zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { db, unwrap } from "@/lib/supabase/server";
import { downloadFile, uploadFile, signedDownloadUrl } from "@/lib/storage";
import { Order } from "@/types/database";
import { getDraft } from "@/modules/drafts/draft-store";
import { isCanvasState } from "@/modules/proofs/design-render";
import { SerializedCanvasState } from "@/modules/designer/types";
import {
  addProductionPage,
  drawCropMarksAndSlug,
  drawDesign,
  embedFonts,
  MM_TO_PT,
  PageGeometry,
  rasterizeSvg,
  renderDesignPng,
  PRODUCTION_DPI,
} from "./production-renderer";
import { generateStandardPrintFileName, generateStandardOrderDirectory } from "./file-naming";
import { mergeVariableDataCsv } from "@/modules/variable-data/csv-merger";

/**
 * Production files for an order (PRD § 07, § 11):
 *   <OrderID>_<ProductType>_<YYYYMMDD>_Output.pdf   print-ready PDF (bleed/trim boxes, crop marks)
 *   <OrderID>_<ProductType>_<YYYYMMDD>_Output.png   300 DPI raster (when the artwork can be rasterised)
 *   <OrderID>_<ProductType>_<YYYYMMDD>_Rows.zip     one PDF per CSV row (variable-data jobs)
 *   <OrderID>_<ProductType>_<YYYYMMDD>_Original.ext the customer's uploaded file, untouched
 * stored under orders/<OrderID>/ in the private `production` bucket.
 *
 * Generated once on the server (never on the customer's device) and reused.
 */

export interface ProductionFileRecord {
  id: string;
  kind: "pdf" | "png" | "csv_zip";
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  dpi: number;
  bleed_mm: number;
  created_at: string;
}

export const MAX_CSV_ROWS = 5000;

export async function listProductionFiles(orderId: string): Promise<ProductionFileRecord[]> {
  const rows = unwrap(
    await db().from("production_files").select("*").eq("order_id", orderId).order("created_at"),
    "Load production files"
  );
  return rows as ProductionFileRecord[];
}

/** Returns the order's production files, generating and storing them on first use. */
export async function ensureProductionFiles(order: Order, options: { regenerate?: boolean } = {}): Promise<ProductionFileRecord[]> {
  const existing = await listProductionFiles(order.id);
  if (existing.length > 0 && !options.regenerate) return existing;
  if (options.regenerate && existing.length > 0) {
    unwrap(await db().from("production_files").delete().eq("order_id", order.id), "Clear production files");
  }

  if (!order.draft_id) throw new Error("This order has no job artwork to produce.");
  const draft = await getDraft(order.draft_id);
  if (!draft) throw new Error("The job behind this order no longer exists.");

  const geo: PageGeometry = { widthMm: draft.options.widthMm, heightMm: draft.options.heightMm, bleedMm: draft.options.bleedMm };
  const productType = order.division_slug || draft.divisionSlug || "print";
  const dir = generateStandardOrderDirectory(order.order_number).replace(/^\//, "");
  const name = (extension: Parameters<typeof generateStandardPrintFileName>[0]["extension"], outputLabel = "Output") =>
    generateStandardPrintFileName({ orderId: order.order_number, productType, extension, outputLabel, date: new Date(order.created_at) });
  const slug = (extra = "") =>
    `ORDER ${order.order_number} | ${productType} | TRIM ${geo.widthMm}x${geo.heightMm}mm | BLEED ${geo.bleedMm}mm | QTY ${draft.quantity}${extra}`;

  const outputs: Array<{ kind: ProductionFileRecord["kind"] | "original"; fileName: string; bytes: Uint8Array; contentType: string; dpi?: number }> = [];

  // 1. Print-ready PDF (+ PNG)
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const { page, originX, originTopY } = addProductionPage(pdf, geo);
  const bleedW = (geo.widthMm + 2 * geo.bleedMm) * MM_TO_PT;
  const bleedH = (geo.heightMm + 2 * geo.bleedMm) * MM_TO_PT;
  let png: Buffer | null = null;

  if (draft.uploadedFileRef) {
    const meta = (draft.designJson ?? {}) as { kind?: string; fileName?: string; contentType?: string };
    const original = await downloadFile("artwork", draft.uploadedFileRef);
    const ext = (meta.fileName?.split(".").pop() || meta.kind || "bin").toLowerCase();
    outputs.push({ kind: "original", fileName: name(ext as "pdf", "Original"), bytes: original, contentType: meta.contentType || "application/octet-stream" });

    // Fit the artwork inside the bleed box, preserving proportions.
    const place = (w: number, h: number) => {
      const scale = Math.min(bleedW / w, bleedH / h);
      return { x: originX + (bleedW - w * scale) / 2, y: originTopY - bleedH + (bleedH - h * scale) / 2, width: w * scale, height: h * scale };
    };
    if (meta.kind === "pdf" || meta.kind === "ai") {
      const [embedded] = await pdf.embedPdf(original, [0]);
      page.drawPage(embedded, place(embedded.width, embedded.height));
    } else if (meta.kind === "png") {
      const image = await pdf.embedPng(original);
      page.drawImage(image, place(image.width, image.height));
      png = original;
    } else if (meta.kind === "svg") {
      png = await rasterizeSvg(original, Math.round(((geo.widthMm + 2 * geo.bleedMm) / 25.4) * PRODUCTION_DPI));
      const image = await pdf.embedPng(png);
      page.drawImage(image, place(image.width, image.height));
    } else {
      throw new Error("EPS artwork must be prepared by pre-press: download the original file.");
    }
  } else if (isCanvasState(draft.designJson)) {
    await drawDesign(pdf, page, { originX, originTopY }, draft.designJson, fonts);
    png = await renderDesignPng(draft.designJson);
  } else {
    throw new Error("This job has no artwork.");
  }

  drawCropMarksAndSlug(page, geo, fonts, slug(` | PROOF v${order.approved_proof_version ?? draft.proofVersion}`));
  outputs.push({ kind: "pdf", fileName: name("pdf"), bytes: await pdf.save(), contentType: "application/pdf", dpi: PRODUCTION_DPI });
  if (png) outputs.push({ kind: "png", fileName: name("png"), bytes: png, contentType: "image/png", dpi: PRODUCTION_DPI });

  // 2. Variable data: one PDF per CSV row, zipped.
  if (draft.csvFileRef) {
    const csv = (await downloadFile("artwork", draft.csvFileRef)).toString("utf8");
    const rows = await renderCsvRows(csv, geo, isCanvasState(draft.designJson) ? draft.designJson : null, productType, order.order_number);
    const files: Record<string, Uint8Array> = {};
    rows.forEach((bytes, i) => {
      files[name("pdf", `Row${String(i + 1).padStart(4, "0")}`)] = bytes;
    });
    outputs.push({ kind: "csv_zip", fileName: name("zip", "Rows"), bytes: zipSync(files, { level: 6 }), contentType: "application/zip" });
  }

  // 3. Store and record
  const records: ProductionFileRecord[] = [];
  for (const out of outputs) {
    const storagePath = `${dir}${out.fileName}`;
    await uploadFile("production", storagePath, Buffer.from(out.bytes), out.contentType);
    if (out.kind === "original") continue;
    const row = unwrap(
      await db()
        .from("production_files")
        .insert({
          order_id: order.id,
          kind: out.kind,
          file_name: out.fileName,
          storage_path: storagePath,
          size_bytes: out.bytes.length,
          dpi: out.dpi ?? PRODUCTION_DPI,
          bleed_mm: geo.bleedMm,
        })
        .select("*")
        .single(),
      "Record production file"
    );
    records.push(row as ProductionFileRecord);
  }
  return records;
}

/**
 * Renders one PDF per CSV row. With a designer template, `{{Column}}` tokens are
 * replaced and fitted per row; without one the standard numbered-bib layout is used.
 */
export async function renderCsvRows(
  csvContent: string,
  geo: PageGeometry,
  template: SerializedCanvasState | null,
  productType: string,
  orderNumber: string
): Promise<Uint8Array[]> {
  const parsed = Papa.parse<Record<string, string>>(csvContent.trim(), { header: true, skipEmptyLines: "greedy" });
  const rows = parsed.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
  if (rows.length === 0) throw new Error("The CSV file has no data rows.");
  if (rows.length > MAX_CSV_ROWS) throw new Error(`CSV files are limited to ${MAX_CSV_ROWS} rows.`);

  const outputs: Uint8Array[] = [];
  if (template) {
    for (let i = 0; i < rows.length; i++) {
      const pdf = await PDFDocument.create();
      const fonts = await embedFonts(pdf);
      const { page, originX, originTopY } = addProductionPage(pdf, geo);
      const report = await drawDesign(pdf, page, { originX, originTopY }, { ...template, dimensionsMm: { ...template.dimensionsMm, ...geo } }, fonts, rows[i]);
      const flag = report.overflowingText.length ? " | CHECK: text overflow" : "";
      drawCropMarksAndSlug(page, geo, fonts, `ORDER ${orderNumber} | ROW ${i + 1}/${rows.length}${flag}`);
      outputs.push(await pdf.save());
    }
    return outputs;
  }

  // No template: standard bib layout, one row per file.
  const headers = parsed.meta.fields ?? [];
  const pick = (re: RegExp, fallback: number) => headers.find((h) => re.test(h)) ?? headers[fallback] ?? headers[0];
  const mappings = {
    numberCol: pick(/bib|number|no\b|plate/i, 0),
    nameCol: pick(/name|athlete|rider/i, 1),
    subCol: headers.find((h) => /category|team|club|class/i.test(h)),
  };
  for (let i = 0; i < rows.length; i++) {
    const single = Papa.unparse([rows[i]], { columns: headers });
    const result = await mergeVariableDataCsv({
      orderId: orderNumber,
      productType,
      widthMm: geo.widthMm,
      heightMm: geo.heightMm,
      bleedMm: geo.bleedMm,
      csvContent: single,
      fieldMappings: mappings,
    });
    outputs.push(result.pdfBytes);
  }
  return outputs;
}

/** Short-lived (60 s) download links for an order's production files. */
export async function signProductionFiles(files: ProductionFileRecord[], ttlSeconds = 60) {
  return Promise.all(
    files.map(async (f) => ({
      kind: f.kind,
      fileName: f.file_name,
      sizeBytes: f.size_bytes,
      url: await signedDownloadUrl("production", f.storage_path, ttlSeconds, f.file_name),
    }))
  );
}
