import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { Order } from "@/types/database";
import { sellerStateCode, stateName } from "@/modules/pricing/gst";

/**
 * GST tax invoice (PDF, A4). Lists HSN, quantity, rate, taxable value, and the
 * CGST/SGST or IGST split for the place of supply.
 *
 * Standard PDF fonts only cover WinAnsi, so amounts are written as "INR 1,234.56"
 * and any other non-WinAnsi characters in customer text are replaced.
 */

const SELLER = {
  name: process.env.SELLER_LEGAL_NAME || "W2P Print House",
  address: process.env.SELLER_ADDRESS || "New Delhi, Delhi, India",
  gstin: process.env.SELLER_GSTIN || "",
};

function inr(paise: number): string {
  return `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Keeps text printable with the standard WinAnsi fonts. */
function safe(text: string | null | undefined): string {
  return (text ?? "").replace(/₹/g, "INR ").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

export async function generateInvoicePdf(order: Order): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.07, 0.08, 0.1);
  const muted = rgb(0.4, 0.45, 0.5);
  const line = rgb(0.85, 0.88, 0.92);

  const text = (p: PDFPage, value: string, x: number, y: number, size = 9, font: PDFFont = regular, color = black) =>
    p.drawText(safe(value), { x, y, size, font, color });
  const right = (value: string, xRight: number, y: number, size = 9, font: PDFFont = regular) =>
    text(page, value, xRight - font.widthOfTextAtSize(safe(value), size), y, size, font);

  // Seller
  text(page, SELLER.name, 50, 780, 16, bold);
  text(page, SELLER.address, 50, 764, 9, regular, muted);
  text(page, SELLER.gstin ? `GSTIN: ${SELLER.gstin}` : "GSTIN: (not registered)", 50, 751, 9, regular, muted);
  text(page, `State: ${stateName(sellerStateCode())} (${sellerStateCode()})`, 50, 738, 9, regular, muted);

  // Invoice meta
  text(page, "TAX INVOICE", 400, 780, 16, bold);
  text(page, `Invoice no: INV-${order.order_number}`, 400, 764);
  text(page, `Date: ${new Date(order.created_at).toLocaleDateString("en-IN")}`, 400, 751);
  text(page, `Payment: ${order.payment_status === "paid" ? "Paid" : "Not paid"}`, 400, 738);

  page.drawLine({ start: { x: 50, y: 722 }, end: { x: 545, y: 722 }, thickness: 1, color: line });

  // Buyer
  const addr = order.shipping_address;
  const pos = order.place_of_supply || addr.state_code || sellerStateCode();
  text(page, "BILL / SHIP TO", 50, 702, 8, bold, muted);
  text(page, order.customer_name || addr.name, 50, 688, 11, bold);
  text(page, [addr.line1, addr.line2].filter(Boolean).join(", "), 50, 674);
  text(page, `${addr.city}${addr.state ? `, ${addr.state}` : ""} ${addr.postal_code}, ${addr.country}`, 50, 662);
  text(page, order.customer_email || "", 50, 650, 9, regular, muted);
  if (order.customer_gstin) text(page, `Customer GSTIN: ${order.customer_gstin}`, 50, 638);
  text(page, `Place of supply: ${stateName(pos) || pos} (${pos})`, 320, 688);

  // Line items
  const igst = order.igst_cents ?? 0;
  const isInterState = igst > 0;
  let y = 600;
  page.drawRectangle({ x: 50, y: y - 6, width: 495, height: 20, color: rgb(0.95, 0.96, 0.97) });
  text(page, "Description", 56, y, 8, bold);
  text(page, "HSN", 290, y, 8, bold);
  right("Qty", 360, y, 8, bold);
  right("Rate", 430, y, 8, bold);
  right("Taxable value", 540, y, 8, bold);
  y -= 24;

  const items = order.items?.length
    ? order.items
    : [
        {
          product_name: "Custom print job",
          width_mm: 0,
          height_mm: 0,
          material: "",
          quantity: 1,
          unit_price_cents: order.subtotal_cents,
          total_price_cents: order.subtotal_cents,
        },
      ];
  for (const it of items) {
    const hsn = (it as { hsn_code?: string | null }).hsn_code ?? "";
    text(page, it.product_name, 56, y, 9, bold);
    if (it.width_mm) text(page, `${it.width_mm} x ${it.height_mm} mm, ${it.material}`, 56, y - 11, 8, regular, muted);
    text(page, hsn, 290, y);
    right(String(it.quantity), 360, y);
    right(inr(it.unit_price_cents), 430, y);
    right(inr(it.total_price_cents), 540, y);
    y -= 32;
  }

  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 545, y: y + 10 }, thickness: 1, color: line });

  // Totals
  const rows: Array<[string, number]> = [["Taxable value", order.subtotal_cents]];
  if (isInterState) rows.push(["IGST", igst]);
  else {
    rows.push(["CGST", order.cgst_cents ?? Math.floor(order.tax_cents / 2)]);
    rows.push(["SGST", order.sgst_cents ?? order.tax_cents - Math.floor(order.tax_cents / 2)]);
  }
  for (const [label, amount] of rows) {
    text(page, label, 360, y - 4);
    right(inr(amount), 540, y - 4);
    y -= 16;
  }
  page.drawLine({ start: { x: 355, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 1, color: line });
  text(page, "Total", 360, y - 8, 11, bold);
  right(inr(order.total_cents), 540, y - 8, 11, bold);

  text(page, "This is a computer-generated invoice.", 50, 60, 8, regular, muted);
  text(page, `Order ${order.order_number}`, 50, 48, 8, regular, muted);

  return pdf.save();
}
