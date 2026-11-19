import { NextRequest, NextResponse } from "next/server";
import { mergeVariableDataCsv } from "@/modules/variable-data/csv-merger";
import { z } from "zod";
import { requireAuth } from "@/lib/server-auth";

const MAX_CSV_BYTES = 1_000_000; // 1 MB
const MAX_ROWS = 5000;
const MAX_SIDE_MM = 1000;

const VariableMergeRequestSchema = z.object({
  orderId: z.string().default("DH-VAR-001"),
  productType: z.string().default("RaceBibs"),
  widthMm: z.number().positive().max(MAX_SIDE_MM).default(210),
  heightMm: z.number().positive().max(MAX_SIDE_MM).default(148),
  bleedMm: z.number().nonnegative().max(20).default(3.0),
  csvContent: z.string().min(10).max(MAX_CSV_BYTES, "CSV files are limited to 1 MB."),
  fieldMappings: z.object({
    numberCol: z.string(),
    nameCol: z.string(),
    subCol: z.string().optional(),
    barcodeCol: z.string().optional(),
  }),
});

/** CSV variable-data merge: signed-in users only, with size and row limits. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const validated = VariableMergeRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid CSV merge request", details: validated.error.format() },
        { status: 400 }
      );
    }

    const rowCount = validated.data.csvContent.trim().split(/\r?\n/).length - 1;
    if (rowCount > MAX_ROWS) {
      return NextResponse.json({ error: `CSV files are limited to ${MAX_ROWS} rows (found ${rowCount}).` }, { status: 413 });
    }

    const result = await mergeVariableDataCsv(validated.data);

    // Return the multi-page compiled PDF
    return new NextResponse(Buffer.from(result.pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "X-W2P-Total-Rows": String(result.totalRows),
        "X-W2P-Processed": String(result.processedRows),
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Variable merge server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
