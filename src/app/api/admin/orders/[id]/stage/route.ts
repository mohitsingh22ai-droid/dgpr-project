import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { updateOrderStageWithVersion } from "@/modules/orders/order-store";
import { logAdminAction } from "@/modules/audit/audit-store";
import { PipelineStage } from "@/types/database";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { stage, expectedStage, notes } = body;

    if (!stage) {
      return NextResponse.json({ error: "Target stage is required." }, { status: 400 });
    }

    const result = await updateOrderStageWithVersion(
      id,
      stage as PipelineStage,
      expectedStage as PipelineStage | undefined,
      auth.user!.email,
      notes
    );

    if (result.conflict) {
      return NextResponse.json(
        {
          error: result.error,
          conflict: true,
          currentStage: result.order?.pipeline_stage,
        },
        { status: 409 }
      );
    }

    if (!result.success || !result.order) {
      return NextResponse.json({ error: result.error || "Stage update failed" }, { status: 400 });
    }

    // Log admin audit
    await logAdminAction(
      auth.user!.id,
      auth.user!.email,
      "pipeline_stage_change",
      "order",
      result.order.order_number,
      {
        from: result.fromStage,
        to: stage,
        notes,
      }
    );

    return NextResponse.json({
      success: true,
      order: result.order,
      emailSent: result.emailSent,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update stage";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
