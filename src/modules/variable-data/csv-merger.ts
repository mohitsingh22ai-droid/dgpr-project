import Papa from "papaparse";
import { PDFDocument, rgb } from "pdf-lib";
import { MM_TO_PT, embedFonts } from "../print-engine/production-renderer";
import { fitText } from "../print-engine/text-fit";
import { generateStandardPrintFileName } from "../print-engine/file-naming";

export interface VariableDataRow {
  [key: string]: string;
}

export interface VariableDataMergeOptions {
  orderId: string;
  productType: string;
  widthMm: number;
  heightMm: number;
  bleedMm?: number;
  csvContent: string;
  fieldMappings: {
    numberCol: string; // Column for big athlete number / plate number
    nameCol: string; // Column for athlete / recipient name
    subCol?: string; // Column for category, team, or club
    barcodeCol?: string; // Column for emergency contact or barcode
  };
}

export interface MergeResult {
  fileName: string;
  pdfBytes: Uint8Array;
  totalRows: number;
  processedRows: number;
  headers: string[];
  previewRows: VariableDataRow[];
}

/**
 * Server-side CSV Variable-Data Merge Engine (§ 07)
 * Takes raw CSV data and generates a consolidated multi-page 300 DPI PDF.
 */
export async function mergeVariableDataCsv(
  options: VariableDataMergeOptions
): Promise<MergeResult> {
  const {
    orderId,
    productType,
    widthMm,
    heightMm,
    bleedMm = 3.0,
    csvContent,
    fieldMappings,
  } = options;

  // 1. Parse CSV string
  const parseResult = Papa.parse<VariableDataRow>(csvContent.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const rows = parseResult.data;
  const headers = parseResult.meta.fields || [];

  if (rows.length === 0) {
    throw new Error("CSV file contains no valid data rows.");
  }

  // 2. Setup PDF Geometry
  const slugMarginMm = 10;
  const trimWidthPt = widthMm * MM_TO_PT;
  const trimHeightPt = heightMm * MM_TO_PT;
  const bleedWidthPt = (widthMm + bleedMm * 2) * MM_TO_PT;
  const bleedHeightPt = (heightMm + bleedMm * 2) * MM_TO_PT;
  const totalPageWidthPt = (widthMm + (bleedMm + slugMarginMm) * 2) * MM_TO_PT;
  const totalPageHeightPt = (heightMm + (bleedMm + slugMarginMm) * 2) * MM_TO_PT;

  const bleedOffsetX = slugMarginMm * MM_TO_PT;
  const bleedOffsetY = slugMarginMm * MM_TO_PT;
  const trimOffsetX = (slugMarginMm + bleedMm) * MM_TO_PT;
  const trimOffsetY = (slugMarginMm + bleedMm) * MM_TO_PT;

  const pdfDoc = await PDFDocument.create();
  // Unicode font: athlete names may contain any script.
  const { regular: fontHelvetica, bold: fontHelveticaBold } = await embedFonts(pdfDoc);

  const black = rgb(0.07, 0.08, 0.1);
  const orange = rgb(1.0, 0.35, 0.12);
  const muted = rgb(0.35, 0.4, 0.45);

  // 3. Process every row server-side (§ 07)
  let processedCount = 0;

  for (const row of rows) {
    const page = pdfDoc.addPage([totalPageWidthPt, totalPageHeightPt]);
    page.setMediaBox(0, 0, totalPageWidthPt, totalPageHeightPt);
    page.setBleedBox(bleedOffsetX, bleedOffsetY, bleedWidthPt, bleedHeightPt);
    page.setTrimBox(trimOffsetX, trimOffsetY, trimWidthPt, trimHeightPt);

    // Draw Bleed Area Background
    page.drawRectangle({
      x: bleedOffsetX,
      y: bleedOffsetY,
      width: bleedWidthPt,
      height: bleedHeightPt,
      color: rgb(0.98, 0.98, 0.99),
    });

    // Extract dynamic fields from current row
    const numberVal = row[fieldMappings.numberCol] || `${processedCount + 1}`;
    const nameVal = row[fieldMappings.nameCol] || "";
    const subVal = fieldMappings.subCol ? row[fieldMappings.subCol] || "" : "";
    const barcodeVal = fieldMappings.barcodeCol ? row[fieldMappings.barcodeCol] || "" : "";

    // Header: Event / Product Type Banner
    page.drawText(productType.replace(/-/g, " ").toUpperCase(), {
      x: trimOffsetX + 20,
      y: trimOffsetY + trimHeightPt - 28,
      size: 13,
      font: fontHelveticaBold,
      color: orange,
    });

    // Large centre number, fitted to the trim width.
    const numSize = fitText(
      numberVal,
      { maxWidth: trimWidthPt - 40, minFontSize: 18, maxFontSize: Math.min(68, trimHeightPt * 0.45) },
      (t, size) => fontHelveticaBold.widthOfTextAtSize(t, size)
    ).fontSize;
    page.drawText(numberVal, {
      x: trimOffsetX + 20,
      y: trimOffsetY + trimHeightPt / 2 - 16,
      size: numSize,
      font: fontHelveticaBold,
      color: black,
    });

    // Per-Placeholder Fitting: Shrink-to-fit name text (§ 04 & § 07)
    if (nameVal) {
      const nameFontSize = fitText(
        nameVal.toUpperCase(),
        { maxWidth: trimWidthPt - 40, minFontSize: 7, maxFontSize: 18, minTracking: -0.04 },
        (t, size) => fontHelveticaBold.widthOfTextAtSize(t, size)
      ).fontSize;

      page.drawText(nameVal.toUpperCase(), {
        x: trimOffsetX + 20,
        y: trimOffsetY + 36,
        size: nameFontSize,
        font: fontHelveticaBold,
        color: black,
      });
    }

    // Category / Subtitle
    if (subVal) {
      page.drawText(subVal, {
        x: trimOffsetX + 20,
        y: trimOffsetY + 20,
        size: 9,
        font: fontHelvetica,
        color: muted,
      });
    }

    // Emergency / Barcode representation
    if (barcodeVal) {
      page.drawText(`ID: ${barcodeVal}`, {
        x: trimOffsetX + trimWidthPt - 120,
        y: trimOffsetY + 20,
        size: 8,
        font: fontHelvetica,
        color: muted,
      });
    }

    // Crop Marks around Trim
    const cropMarkLen = 15;
    page.drawLine({ start: { x: trimOffsetX - cropMarkLen, y: trimOffsetY }, end: { x: trimOffsetX, y: trimOffsetY }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: trimOffsetX, y: trimOffsetY - cropMarkLen }, end: { x: trimOffsetX, y: trimOffsetY }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: trimOffsetX + trimWidthPt, y: trimOffsetY }, end: { x: trimOffsetX + trimWidthPt + cropMarkLen, y: trimOffsetY }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: trimOffsetX + trimWidthPt, y: trimOffsetY - cropMarkLen }, end: { x: trimOffsetX + trimWidthPt, y: trimOffsetY }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: trimOffsetX - cropMarkLen, y: trimOffsetY + trimHeightPt }, end: { x: trimOffsetX, y: trimOffsetY + trimHeightPt }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: trimOffsetX, y: trimOffsetY + trimHeightPt }, end: { x: trimOffsetX, y: trimOffsetY + trimHeightPt + cropMarkLen }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: trimOffsetX + trimWidthPt, y: trimOffsetY + trimHeightPt }, end: { x: trimOffsetX + trimWidthPt + cropMarkLen, y: trimOffsetY + trimHeightPt }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: trimOffsetX + trimWidthPt, y: trimOffsetY + trimHeightPt }, end: { x: trimOffsetX + trimWidthPt, y: trimOffsetY + trimHeightPt + cropMarkLen }, thickness: 0.5, color: rgb(0, 0, 0) });

    // Technical Slug Metadata Line
    const slug = `ORDER: ${orderId} | ROW: ${processedCount + 1}/${rows.length} | BIB: ${numberVal} | ${widthMm}x${heightMm}mm | 300 DPI`;
    page.drawText(slug, {
      x: bleedOffsetX,
      y: bleedOffsetY + bleedHeightPt + 8,
      size: 7,
      font: fontHelvetica,
      color: muted,
    });

    processedCount++;
  }

  const fileName = generateStandardPrintFileName({
    orderId,
    productType: `${productType}_VariableMerged`,
    extension: "pdf",
  });

  const pdfBytes = await pdfDoc.save();

  return {
    fileName,
    pdfBytes,
    totalRows: rows.length,
    processedRows: processedCount,
    headers,
    previewRows: rows.slice(0, 5),
  };
}
