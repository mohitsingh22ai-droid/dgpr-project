import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getAuditLogs } from "@/modules/audit/audit-store";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const target_type = searchParams.get("target_type") || undefined;
    const target_id = searchParams.get("target_id") || undefined;
    const action = searchParams.get("action") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const logs = await getAuditLogs({ target_type, target_id, action, limit });

    return NextResponse.json({ logs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load audit logs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
