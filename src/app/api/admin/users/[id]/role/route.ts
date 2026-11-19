import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { updateUserRole } from "@/modules/auth/users-store";
import { logAdminAction } from "@/modules/audit/audit-store";
import { UserRole } from "@/types/database";

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
    const { role } = body;

    if (!role || (role !== "customer" && role !== "admin")) {
      return NextResponse.json(
        { error: "Invalid role. Role must be 'customer' or 'admin'." },
        { status: 400 }
      );
    }

    const result = await updateUserRole(auth.user!.id, id, role as UserRole);

    if (!result.success || !result.user) {
      return NextResponse.json({ error: result.error || "Role update failed" }, { status: result.error === "Target user not found" ? 404 : 400 });
    }

    await logAdminAction(
      auth.user!.id,
      auth.user!.email,
      "user_role_change",
      "user",
      result.user.id,
      {
        targetEmail: result.user.email,
        newRole: role,
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
    const msg = err instanceof Error ? err.message : "Failed to change user role";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
