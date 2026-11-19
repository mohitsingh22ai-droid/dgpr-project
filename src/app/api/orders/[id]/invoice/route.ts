import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/modules/orders/order-store";
import { generateInvoicePdf } from "@/modules/orders/invoice-pdf-generator";
import { getAuthUser } from "@/lib/server-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionUser = await getAuthUser(req);

    if (!sessionUser) {
      return NextResponse.json(
        { error: "Unauthorized: Valid session required to view invoice" },
        { status: 401 }
      );
    }

    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: `Order ${id} not found` }, { status: 404 });
    }

    // Strict Customer Tenant Isolation (PRD § 03, § 10)
    if (sessionUser.role !== "admin") {
      const isOwner =
        order.customer_id === sessionUser.id;
      if (!isOwner) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to download this invoice" },
          { status: 403 }
        );
      }
    }

    const pdfBytes = await generateInvoicePdf(order);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice_${order.order_number}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error generating tax invoice";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
