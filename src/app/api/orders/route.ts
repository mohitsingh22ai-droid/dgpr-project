import { NextRequest, NextResponse } from "next/server";
import { getOrdersForUser } from "@/modules/orders/order-store";
import { getAuthUser } from "@/lib/server-auth";

/**
 * Lists orders. Customers always get exactly their own orders; admins get all
 * orders, or one customer's with ?userId=<uuid>.
 *
 * There is deliberately no POST: orders are created only by checkout after the
 * proof is approved and payment is handled server-side.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getAuthUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized: Valid session required to view orders" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");

    if (sessionUser.role === "admin") {
      const orders = await getOrdersForUser(targetUserId, targetUserId ? "customer" : "admin");
      return NextResponse.json({ orders });
    }

    // Attempts to widen the scope (role=admin, another userId) are refused outright.
    const requestedRole = searchParams.get("role");
    if ((requestedRole && requestedRole !== "customer") || (targetUserId && targetUserId !== sessionUser.id)) {
      return NextResponse.json({ error: "Forbidden: customers can only list their own orders." }, { status: 403 });
    }

    const orders = await getOrdersForUser(sessionUser.id, "customer");
    return NextResponse.json({ orders });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to retrieve orders";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
