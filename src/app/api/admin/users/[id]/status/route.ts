import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { updateUserStatus } from "@/modules/auth/users-store";
import { logAdminAction } from "@/modules/audit/audit-store";

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
    const { isActive } = body;

    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "Invalid status: 'isActive' must be a boolean." },
        { status: 400 }
      );
    }

    const result = await updateUserStatus(auth.user!.id, id, isActive);

    if (!result.success || !result.user) {
      return NextResponse.json({ error: result.error || "Status update failed" }, { status: result.error === "Target user not found" ? 404 : 400 });
    }

    await logAdminAction(
      auth.user!.id,
      auth.user!.email,
      "user_status_change",
      "user",
      result.user.id,
      {
        targetEmail: result.user.email,
        isActive,
      }
    );

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.full_name,
        role: result.user.role,
        isActive: result.user.isActive,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to change user status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
