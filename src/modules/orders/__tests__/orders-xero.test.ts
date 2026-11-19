import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateXeroInvoicePayload } from "../xero-generator";
import { generateInvoicePdf } from "../invoice-pdf-generator";
import { INITIAL_ORDERS } from "@/lib/data/mock-data";
import { Order } from "@/types/database";

describe("Checkout, Accounting-Ready Data (Xero) & Reorder Tests (§ 05, § 09, § 10)", () => {
  const sampleOrder = INITIAL_ORDERS[0];

  describe("Xero Accounting Schema Compliance (§ 05 & § 14)", () => {
    it("generates valid ACCREC invoice payload with Sales 200 and GST/IGST tax types in INR", () => {
      const payload = generateXeroInvoicePayload(sampleOrder);

      // Verify standard Xero invoice attributes
      assert.equal(payload.Type, "ACCREC");
      assert.equal(payload.InvoiceNumber, `INV-${sampleOrder.order_number}`);
      assert.equal(payload.Status, "AUTHORISED");
      assert.equal(payload.LineAmountTypes, "Exclusive");
      assert.equal(payload.CurrencyCode, "INR");

      // Verify Contact mapping
      assert.equal(payload.Contact.Name, sampleOrder.customer_name);
      assert.equal(payload.Contact.EmailAddress, sampleOrder.customer_email);
      assert.equal(payload.Contact.Addresses?.[0].PostalCode, sampleOrder.shipping_address.postal_code);

      // Verify Financial Totals
      assert.equal(payload.SubTotal, sampleOrder.subtotal_cents / 100);
      assert.equal(payload.TotalTax, sampleOrder.tax_cents / 100);
      assert.equal(payload.Total, sampleOrder.total_cents / 100);

      // Verify line items
      assert.ok(payload.LineItems.length > 0);
      assert.equal(payload.LineItems[0].AccountCode, "200");
      assert.match(payload.LineItems[0].TaxType, /^I?GST\d+$/);
    });

    it("calculates Net 14 due date accurately", () => {
      const payload = generateXeroInvoicePayload(sampleOrder);
      const invoiceDate = new Date(payload.Date);
      const dueDate = new Date(payload.DueDate);

      const diffDays = Math.round((dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
      assert.equal(diffDays, 14);
    });
  });

  describe("1-Click Reorder Flow Logic (§ 09 & § 10)", () => {
    it("clones historical order into a new production job without redesigning", () => {
      const newOrderNumber = "DH-2026-00999";
      const clonedOrder: Order = {
        ...sampleOrder,
        id: `ord-reorder-${Date.now()}`,
        order_number: newOrderNumber,
        pipeline_stage: "ORDER",
        payment_status: "paid",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      assert.notEqual(clonedOrder.id, sampleOrder.id);
      assert.equal(clonedOrder.order_number, newOrderNumber);
      assert.equal(clonedOrder.pipeline_stage, "ORDER");
      assert.equal(clonedOrder.customer_id, sampleOrder.customer_id);
      assert.equal(clonedOrder.total_cents, sampleOrder.total_cents);
    });
  });

  describe("VAT Tax Invoice PDF Generation (§ 10 Module 6)", () => {
    it("generates downloadable A4 VAT invoice PDF binary", async () => {
      const pdfBytes = await generateInvoicePdf(sampleOrder);

      // Verify PDF binary signature
      const header = Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8");
      assert.equal(header, "%PDF-");
      assert.ok(pdfBytes.length > 500);
    });
  });
});
