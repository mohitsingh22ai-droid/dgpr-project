import crypto from "crypto";
import Papa from "papaparse";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDraft, updateDraft, presentDraft } from "@/modules/drafts/draft-store";
import { getProductById } from "@/modules/catalog/catalog-store";
import { authorizeDraft } from "@/lib/draft-access";
import { uploadFile, deleteFile } from "@/lib/storage";
import { MAX_CSV_ROWS } from "@/modules/print-engine/production-service";

const CsvSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  csvContent: z.string().min(1).max(1_000_000, "CSV files are limited to 1 MB."),
});

/**
 * Attaches the variable-data CSV to a job for products that support it (PRD § 07).
 * Validates headers and rows; the quantity of the job must match the row count so
 * the price covers every personalised item. One print file per row is produced
 * server-side after payment.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedBody = CsvSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "A CSV file is required." }, { status: 400 });
  }

  const draft = await getDraft(id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const access = await authorizeDraft(req, draft);
  if (!access.ok) return access.response;
  if (!["configured", "artwork_ready", "proof_pending"].includes(draft.status)) {
    return NextResponse.json({ error: "This job is approved and its data can no longer change." }, { status: 409 });
  }

  const product = await getProductById(draft.productId);
  if (!product?.has_variable_data) {
    return NextResponse.json({ error: "This product does not support variable-data printing." }, { status: 422 });
  }

  const parsed = Papa.parse<Record<string, string>>(parsedBody.data.csvContent.replace(/^﻿/, "").trim(), {
    header: true,
    skipEmptyLines: "greedy",
  });
  const headers = (parsed.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
  const rows = parsed.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));

  const problems: string[] = [];
  if (headers.length === 0) problems.push("The first line must contain column headers.");
  if (new Set(headers).size !== headers.length) problems.push("Column headers must be unique.");
  if (rows.length === 0) problems.push("The CSV file has no data rows.");
  if (rows.length > MAX_CSV_ROWS) problems.push(`CSV files are limited to ${MAX_CSV_ROWS} rows (found ${rows.length}).`);
  const badRows = parsed.errors.filter((e) => e.type === "FieldMismatch").map((e) => (e.row ?? 0) + 2);
  if (badRows.length) problems.push(`Rows with the wrong number of columns: ${badRows.slice(0, 10).join(", ")}${badRows.length > 10 ? "…" : ""}.`);
  if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 422 });

  if (rows.length !== draft.quantity) {
    return NextResponse.json(
      {
        error: `The CSV has ${rows.length} rows but the job is for ${draft.quantity} items. Change the quantity to ${rows.length} or adjust the file.`,
        rowCount: rows.length,
      },
      { status: 422 }
    );
  }

  const path = `drafts/${id}/data-${crypto.randomUUID()}.csv`;
  await uploadFile("artwork", path, Buffer.from(parsedBody.data.csvContent, "utf8"), "text/csv");
  if (draft.csvFileRef) await deleteFile("artwork", draft.csvFileRef).catch(() => undefined);

  const updated = await updateDraft(id, { csvFileRef: path }, { id: access.actor.id, email: access.actor.email }, "VARIABLE_DATA_ATTACHED");
  return NextResponse.json({
    draft: await presentDraft(updated),
    headers,
    rowCount: rows.length,
    preview: rows.slice(0, 5),
  });
}
