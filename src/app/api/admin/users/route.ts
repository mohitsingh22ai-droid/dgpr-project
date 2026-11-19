import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getAllUsers } from "@/modules/auth/users-store";
import { countOrdersByCustomer } from "@/modules/orders/order-store";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const [users, orderCounts] = await Promise.all([getAllUsers(), countOrdersByCustomer()]);
    const safeUsers = users.map((u) => {
      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        company_name: u.company_name,
        phone: u.phone,
        isActive: u.isActive !== false,
        orderCount: orderCounts[u.id] ?? 0,
        created_at: u.created_at,
      };
    });

    return NextResponse.json({ users: safeUsers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to retrieve users";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
