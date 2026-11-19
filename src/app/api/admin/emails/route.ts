import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getEmailLogs } from "@/modules/email/email-store";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("order_id") || undefined;
    const recipient = searchParams.get("recipient") || undefined;
    const event = searchParams.get("event") || undefined;

    const logs = await getEmailLogs({ orderId, recipient, event });

    return NextResponse.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load email logs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
