import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getOrderById, checkReadyForProduction } from "@/modules/orders/order-store";
import { logAdminAction } from "@/modules/audit/audit-store";
import { ensureProductionFiles, signProductionFiles } from "@/modules/print-engine/production-service";

/**
 * Production file download (PRD § 11 capability 03). Admin only, and only once the
 * order is ready for production (paid AND proof approved). Files are generated on
 * the server on first request, stored privately, and returned as 60-second links.
 * `?regenerate=1` rebuilds them (e.g. after a revised proof).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const order = await getOrderById(id);
    if (!order) return NextResponse.json({ error: `Order '${id}' not found` }, { status: 404 });

    const gate = checkReadyForProduction(order);
    if (!gate.isReady) {
      return NextResponse.json(
        { error: "Order is not ready for production.", reason: gate.reason, proofApproved: gate.proofApproved, paymentConfirmed: gate.paymentConfirmed },
        { status: 403 }
      );
    }

    const regenerate = req.nextUrl.searchParams.get("regenerate") === "1";
    const files = await signProductionFiles(await ensureProductionFiles(order, { regenerate }), 60);

    await logAdminAction(auth.user.id, auth.user.email, "production_file_download", "order", order.order_number, {
      files: files.map((f) => f.fileName),
      proofVersion: order.approved_proof_version ?? null,
      regenerated: regenerate,
    });

    const pdf = files.find((f) => f.kind === "pdf");
    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      downloadUrl: pdf?.url ?? files[0]?.url,
      files,
      ttlSeconds: 60,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to prepare production files";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
