import crypto from "crypto";
import { db, unwrap } from "@/lib/supabase/server";
import { Order, OrderItem, PipelineStage, DivisionSlug } from "@/types/database";
import { safeSendNotificationEmail } from "@/modules/email/email-service";

/**
 * Orders repository (public.orders + order_items + order_events).
 * Money columns are paise; they are exposed on the Order type as `*_cents`
 * until the Phase 3 money/GST refactor renames the app-level fields.
 */

export interface StatusHistoryEntry {
  from: PipelineStage;
  to: PipelineStage;
  changed_by: string;
  timestamp: string;
  notes?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_COLUMNS = "*, order_items(*), order_events(*)";

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  division_slug: DivisionSlug;
  width_mm: number | string;
  height_mm: number | string;
  material_id: string;
  material_name: string;
  quantity: number;
  unit_price_paise: number;
  line_subtotal_paise: number;
  artwork_type: "designer" | "upload";
  design_json: Record<string, unknown> | null;
  uploaded_file_path: string | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  customer_email: string;
  customer_name: string;
  draft_id: string | null;
  division_slug: DivisionSlug | null;
  pipeline_stage: PipelineStage;
  payment_status: Order["payment_status"];
  currency: string;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  place_of_supply: string | null;
  customer_gstin: string | null;
  tax_paise: number;
  total_paise: number;
  shipping_address: Order["shipping_address"];
  approved_proof_version: number | null;
  stripe_session_id: string | null;
  xero_invoice: Order["xero_invoice_data"] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[];
  order_events?: Array<{ from_stage: PipelineStage | null; to_stage: PipelineStage; changed_by: string; notes: string | null; created_at: string }>;
}

function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    order_id: row.order_id,
    product_id: row.product_id ?? "",
    product_name: row.product_name,
    division_slug: row.division_slug,
    width_mm: Number(row.width_mm),
    height_mm: Number(row.height_mm),
    material: row.material_name,
    quantity: row.quantity,
    unit_price_cents: row.unit_price_paise,
    total_price_cents: row.line_subtotal_paise,
    artwork_type: row.artwork_type === "upload" ? "direct_upload" : "in_browser_designer",
    canvas_json: row.design_json,
    uploaded_file_url: row.uploaded_file_path,
    created_at: row.created_at,
  };
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    order_number: row.order_number,
    customer_id: row.customer_id,
    customer_email: row.customer_email,
    customer_name: row.customer_name,
    pipeline_stage: row.pipeline_stage,
    payment_status: row.payment_status,
    subtotal_cents: row.subtotal_paise,
    tax_cents: row.tax_paise,
    cgst_cents: row.cgst_paise,
    sgst_cents: row.sgst_paise,
    igst_cents: row.igst_paise,
    place_of_supply: row.place_of_supply,
    customer_gstin: row.customer_gstin,
    total_cents: row.total_paise,
    currency: row.currency,
    division_slug: row.division_slug ?? undefined,
    items: (row.order_items ?? []).map(toOrderItem),
    approved_proof_version: row.approved_proof_version ?? undefined,
    proof_version: row.approved_proof_version ?? undefined,
    status_history: [...(row.order_events ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({
        from: (e.from_stage ?? "QUOTE") as PipelineStage,
        to: e.to_stage,
        changed_by: e.changed_by,
        timestamp: e.created_at,
        notes: e.notes ?? undefined,
      })),
    shipping_address: row.shipping_address,
    xero_invoice_data: row.xero_invoice ?? undefined,
    notes: row.notes ?? undefined,
    stripe_session_id: row.stripe_session_id ?? undefined,
    draft_id: row.draft_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Reserves the next order number from the database sequence (never random). */
export async function reserveOrderNumber(): Promise<string> {
  const value = unwrap(await db().rpc("next_order_number"), "Reserve order number");
  return value as unknown as string;
}

export interface NewOrderItem {
  product_id: string;
  product_name: string;
  division_slug: string;
  hsn_code?: string | null;
  width_mm: number;
  height_mm: number;
  material_id: string;
  material_name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  gst_rate: number;
  artwork_type: "designer" | "upload";
  design_json?: Record<string, unknown> | null;
  uploaded_file_path?: string | null;
}

/**
 * Persists an order. Idempotent on order_number and on stripe_session_id: a replay
 * returns the existing order with isNew=false. An order must belong to a real
 * customer account; there is no fallback owner.
 */
export async function createOrder(
  order: Order,
  items: NewOrderItem[] = []
): Promise<{ order: Order; isNew: boolean }> {
  if (!order.customer_id || !UUID_RE.test(order.customer_id)) {
    throw new Error("An order must belong to a signed-in customer account.");
  }

  if (order.order_number) {
    const existing = await getOrderById(order.order_number);
    if (existing) return { order: existing, isNew: false };
  }
  if (order.stripe_session_id) {
    const existing = unwrap(
      await db().from("orders").select("order_number").eq("stripe_session_id", order.stripe_session_id).maybeSingle(),
      "Check Stripe session"
    ) as { order_number: string } | null;
    if (existing) return { order: (await getOrderById(existing.order_number))!, isNew: false };
  }

  const addr = order.shipping_address;
  if (!addr?.line1 || !addr.city || !addr.postal_code || !addr.country) {
    throw new Error("A complete shipping address is required.");
  }

  // GST split: callers pass the split computed for the place of supply; when it
  // is missing (legacy callers) the tax is treated as intra-state CGST + SGST.
  const hasSplit = order.cgst_cents !== undefined || order.igst_cents !== undefined;
  const cgst = hasSplit ? order.cgst_cents ?? 0 : Math.floor(order.tax_cents / 2);
  const sgst = hasSplit ? order.sgst_cents ?? 0 : order.tax_cents - cgst;
  const igst = hasSplit ? order.igst_cents ?? 0 : 0;
  if (cgst + sgst + igst !== order.tax_cents) {
    throw new Error("GST components do not add up to the tax total.");
  }

  const inserted = unwrap(
    await db()
      .from("orders")
      .insert({
        ...(order.order_number ? { order_number: order.order_number } : {}),
        customer_id: order.customer_id,
        customer_email: order.customer_email ?? "",
        customer_name: order.customer_name ?? "",
        draft_id: order.draft_id && UUID_RE.test(order.draft_id) ? order.draft_id : null,
        division_slug: order.division_slug ?? items[0]?.division_slug ?? null,
        pipeline_stage: order.pipeline_stage || "ORDER",
        payment_status: order.payment_status || "pending",
        currency: order.currency || "INR",
        subtotal_paise: order.subtotal_cents,
        cgst_paise: cgst,
        sgst_paise: sgst,
        igst_paise: igst,
        place_of_supply: order.place_of_supply ?? null,
        customer_gstin: order.customer_gstin ?? null,
        tax_paise: order.tax_cents,
        total_paise: order.subtotal_cents + order.tax_cents,
        shipping_address: {
          name: (addr.name || order.customer_name || "").trim(),
          line1: addr.line1.trim(),
          line2: addr.line2?.trim() || undefined,
          city: addr.city.trim(),
          state: addr.state?.trim() || undefined,
          state_code: addr.state_code || undefined,
          postal_code: addr.postal_code.trim().toUpperCase(),
          country: addr.country.trim(),
          phone: addr.phone?.trim() || undefined,
        },
        approved_proof_version: order.approved_proof_version ?? order.proof_version ?? null,
        stripe_session_id: order.stripe_session_id ?? null,
        xero_invoice: order.xero_invoice_data ?? null,
        notes: order.notes ?? null,
      })
      .select("id, order_number, pipeline_stage")
      .single(),
    "Create order"
  ) as { id: string; order_number: string; pipeline_stage: PipelineStage };

  if (items.length > 0) {
    unwrap(
      await db().from("order_items").insert(
        items.map((it) => ({
          order_id: inserted.id,
          product_id: it.product_id,
          product_name: it.product_name,
          division_slug: it.division_slug,
          hsn_code: it.hsn_code ?? null,
          width_mm: it.width_mm,
          height_mm: it.height_mm,
          material_id: it.material_id,
          material_name: it.material_name,
          quantity: it.quantity,
          unit_price_paise: it.unit_price_cents,
          line_subtotal_paise: it.total_price_cents,
          gst_rate: it.gst_rate,
          artwork_type: it.artwork_type,
          design_json: it.design_json ?? null,
          uploaded_file_path: it.uploaded_file_path ?? null,
        }))
      ),
      "Create order items"
    );
  }

  unwrap(
    await db().from("order_events").insert({
      order_id: inserted.id,
      from_stage: "QUOTE",
      to_stage: inserted.pipeline_stage,
      changed_by: order.customer_email || "customer",
      notes: "Order placed and confirmed",
    }),
    "Log order event"
  );

  return { order: (await getOrderById(inserted.id))!, isNew: true };
}

/** Retrieves an order by order number or id. */
export async function getOrderById(idOrOrderNumber: string): Promise<Order | null> {
  const column = UUID_RE.test(idOrOrderNumber) ? "id" : "order_number";
  const row = unwrap(
    await db().from("orders").select(ORDER_COLUMNS).eq(column, idOrOrderNumber).maybeSingle(),
    "Load order"
  );
  return row ? toOrder(row as unknown as OrderRow) : null;
}

/**
 * Ready-for-production gate: true only when payment is confirmed AND the customer
 * approved a proof for this order. Reaching a pipeline stage never implies approval.
 */
export function checkReadyForProduction(order: Order): {
  isReady: boolean;
  reason: string | null;
  proofApproved: boolean;
  paymentConfirmed: boolean;
} {
  const proofApproved = !!order.approved_proof_version && order.proof_status !== "changes_requested";
  const paymentConfirmed = order.payment_status === "paid";
  const isReady = proofApproved && paymentConfirmed;

  let reason: string | null = null;
  if (!isReady) {
    if (!proofApproved && !paymentConfirmed) reason = "Proof not approved and payment not confirmed";
    else if (!proofApproved) reason = "Proof pending customer approval";
    else reason = `Payment not confirmed (Status: ${order.payment_status})`;
  }
  return { isReady, reason, proofApproved, paymentConfirmed };
}

/** Orders visible to a user. Customers see only orders owned by their account id. */
export async function getOrdersForUser(userId?: string | null, role: string = "customer"): Promise<Order[]> {
  let query = db().from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false });
  if (role !== "admin") {
    if (!userId || !UUID_RE.test(userId)) return [];
    query = query.eq("customer_id", userId);
  }
  const rows = unwrap(await query, "Load orders");
  return (rows as unknown as OrderRow[]).map(toOrder);
}

export async function countOrdersByCustomer(): Promise<Record<string, number>> {
  const rows = unwrap(await db().from("orders").select("customer_id"), "Count orders") as Array<{ customer_id: string }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.customer_id] = (counts[r.customer_id] ?? 0) + 1;
  return counts;
}

/** Inclusive end-of-day bound for a YYYY-MM-DD date filter. */
function endOfDay(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,()\\]/g, (c) => `\\${c}`);
}

/**
 * Admin search & combinable filters (PRD § 11 capability 01), paginated server-side, newest first.
 */
export async function searchAdminOrders(options: {
  query?: string;
  stage?: string;
  payment_status?: string;
  customer?: string;
  product_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}): Promise<{
  orders: Array<Order & { isReadyForProduction: boolean; notReadyReason: string | null }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const offset = (page - 1) * limit;

  let query = db().from("orders").select(ORDER_COLUMNS, { count: "exact" });

  if (options.query?.trim()) {
    const q = escapeIlike(options.query.trim());
    query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%`);
  }
  if (options.stage?.trim()) query = query.eq("pipeline_stage", options.stage.trim().toUpperCase());
  if (options.payment_status?.trim()) query = query.eq("payment_status", options.payment_status.trim().toLowerCase());
  if (options.customer?.trim()) {
    const c = escapeIlike(options.customer.trim());
    query = query.or(`customer_email.ilike.%${c}%,customer_name.ilike.%${c}%`);
  }
  if (options.product_type?.trim()) query = query.eq("division_slug", options.product_type.trim().toLowerCase());
  if (options.date_from && !isNaN(Date.parse(options.date_from))) query = query.gte("created_at", options.date_from);
  if (options.date_to && !isNaN(Date.parse(options.date_to))) query = query.lte("created_at", endOfDay(options.date_to));

  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(`Search orders: ${error.message}`);

  const orders = ((data ?? []) as unknown as OrderRow[]).map((row) => {
    const order = toOrder(row);
    const gate = checkReadyForProduction(order);
    // Accounting payloads are not needed in list views.
    const { xero_invoice_data: _omit, ...rest } = order; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, isReadyForProduction: gate.isReady, notReadyReason: gate.reason };
  });

  const total = count ?? 0;
  return { orders, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

/**
 * Pipeline (PRD § 11): QUOTE → ORDER → ARTWORK → (PROOF) → PRODUCTION → COMPLETED.
 *
 * - QUOTE → ORDER happens when Stripe confirms payment.
 * - ARTWORK is the pre-press check. The proof was approved before payment, so a
 *   checked job goes ARTWORK → PRODUCTION; PROOF is used only when pre-press
 *   issues a revised proof (ARTWORK → PROOF → PRODUCTION, or back to ARTWORK).
 */
const PIPELINE_SEQUENCE: PipelineStage[] = ["QUOTE", "ORDER", "ARTWORK", "PROOF", "PRODUCTION", "COMPLETED"];
const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  QUOTE: ["ORDER"],
  ORDER: ["ARTWORK"],
  ARTWORK: ["PROOF", "PRODUCTION", "ORDER"],
  PROOF: ["PRODUCTION", "ARTWORK"],
  PRODUCTION: ["COMPLETED"],
  COMPLETED: [],
};

export function validateStageTransition(current: PipelineStage, target: PipelineStage): { valid: boolean; error?: string } {
  if (current === target) return { valid: true };
  if (!PIPELINE_SEQUENCE.includes(current) || !PIPELINE_SEQUENCE.includes(target)) {
    return { valid: false, error: `Invalid pipeline stage: ${target}` };
  }
  if (ALLOWED_TRANSITIONS[current].includes(target)) return { valid: true };

  if (PIPELINE_SEQUENCE.indexOf(target) > PIPELINE_SEQUENCE.indexOf(current)) {
    return {
      valid: false,
      error: `Stage skipping is not allowed. Cannot transition directly from ${current} to ${target}. Allowed next stages: ${ALLOWED_TRANSITIONS[current].join(", ") || "none"}.`,
    };
  }
  return {
    valid: false,
    error: `Illegal backward transition from ${current} to ${target}. Only PROOF -> ARTWORK and ARTWORK -> ORDER are permitted for pre-press revisions.`,
  };
}

/** Business preconditions for entering a stage (beyond the transition graph). */
export function checkStagePreconditions(order: Order, target: PipelineStage): string | null {
  if (target === "ORDER" && order.payment_status !== "paid") {
    return "An order only leaves QUOTE once Stripe has confirmed the payment.";
  }
  if (target === "PRODUCTION" || target === "COMPLETED") {
    const gate = checkReadyForProduction(order);
    if (!gate.isReady) return `Not ready for production: ${gate.reason}.`;
  }
  return null;
}

/**
 * Moves an order to a new pipeline stage with optimistic locking (the update only
 * applies if the stage has not changed since it was read) and notifies the customer.
 */
export async function updateOrderStageWithVersion(
  orderNumberOrId: string,
  newStage: PipelineStage,
  expectedStage?: PipelineStage,
  actorEmail: string = "system",
  notes?: string
): Promise<{ success: boolean; order?: Order; conflict?: boolean; error?: string; emailSent?: boolean; fromStage?: PipelineStage }> {
  const existing = await getOrderById(orderNumberOrId);
  if (!existing) return { success: false, error: `Order '${orderNumberOrId}' not found.` };

  if (expectedStage && existing.pipeline_stage !== expectedStage) {
    return {
      success: false,
      conflict: true,
      order: existing,
      error: `Stale order stage conflict. Expected '${expectedStage}' but current stage is '${existing.pipeline_stage}'. Please refresh.`,
    };
  }

  const transition = validateStageTransition(existing.pipeline_stage, newStage);
  if (!transition.valid) return { success: false, error: transition.error };
  const precondition = checkStagePreconditions(existing, newStage);
  if (precondition) return { success: false, error: precondition };

  const fromStage = existing.pipeline_stage;
  const updated = unwrap(
    await db()
      .from("orders")
      .update({ pipeline_stage: newStage })
      .eq("id", existing.id)
      .eq("pipeline_stage", fromStage)
      .select("id"),
    "Update stage"
  ) as Array<{ id: string }>;

  if (updated.length === 0) {
    return { success: false, conflict: true, error: "The order changed while you were editing it. Please refresh." };
  }

  unwrap(
    await db().from("order_events").insert({
      order_id: existing.id,
      from_stage: fromStage,
      to_stage: newStage,
      changed_by: actorEmail,
      notes: notes ?? null,
    }),
    "Log stage change"
  );

  await safeSendNotificationEmail({
    to: existing.customer_email || "",
    recipientName: existing.customer_name || "Customer",
    event: newStage === "COMPLETED" ? "order_completed" : "pipeline_status_changed",
    orderId: existing.id,
    orderNumber: existing.order_number,
    stage: newStage,
    shippingAddress: existing.shipping_address,
  }).catch((err) => console.error("[OrderStore] Failed to send stage notification email:", err));

  return { success: true, order: (await getOrderById(existing.id))!, emailSent: true, fromStage };
}

/** Marks an order paid (used by payment confirmation). */
export async function markOrderPaid(orderId: string, details: { stripeSessionId?: string; paymentIntentId?: string } = {}): Promise<void> {
  unwrap(
    await db()
      .from("orders")
      .update({
        payment_status: "paid",
        ...(details.stripeSessionId ? { stripe_session_id: details.stripeSessionId } : {}),
        ...(details.paymentIntentId ? { stripe_payment_intent_id: details.paymentIntentId } : {}),
      })
      .eq("id", orderId),
    "Mark order paid"
  );
}

function signingSecret(): string {
  const secret = process.env.SIGNED_URL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SIGNED_URL_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to sign download links.");
  return crypto.createHash("sha256").update(`download-links:${secret}`).digest("hex");
}

/** Short-lived (default 60 s) HMAC token for production file downloads. */
export function generateSignedDownloadToken(orderNumber: string, expiresInSeconds: number = 60): { token: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const hmac = crypto.createHmac("sha256", signingSecret()).update(`${orderNumber}:${expires}`).digest("hex");
  return { token: `${hmac}.${expires}`, expires };
}

export function verifySignedDownloadToken(orderNumber: string, token: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return false;

  const expires = parseInt(parts[1], 10);
  if (Math.floor(Date.now() / 1000) > expires) return false;

  const expected = crypto.createHmac("sha256", signingSecret()).update(`${orderNumber}:${expires}`).digest("hex");
  const a = Buffer.from(parts[0]);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Admin reports (PRD § 11 capability 05). Revenue counts confirmed payments only. */
export async function getAdminReportsData(dateFrom?: string, dateTo?: string) {
  let query = db().from("orders").select("pipeline_stage, payment_status, total_paise, division_slug, created_at, order_items(quantity)");
  if (dateFrom && !isNaN(Date.parse(dateFrom))) query = query.gte("created_at", dateFrom);
  if (dateTo && !isNaN(Date.parse(dateTo))) query = query.lte("created_at", endOfDay(dateTo));
  const rows = unwrap(await query, "Load report data") as Array<{
    pipeline_stage: PipelineStage;
    payment_status: string;
    total_paise: number;
    division_slug: string | null;
    order_items: Array<{ quantity: number }>;
  }>;

  const stageCounts: Record<PipelineStage, number> = { QUOTE: 0, ORDER: 0, ARTWORK: 0, PROOF: 0, PRODUCTION: 0, COMPLETED: 0 };
  const divisionThroughput: Record<string, { count: number; totalQuantity: number; revenueCents: number }> = {};
  let confirmedRevenueCents = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let cancelledCount = 0;
  let failedCount = 0;

  for (const o of rows) {
    stageCounts[o.pipeline_stage] = (stageCounts[o.pipeline_stage] ?? 0) + 1;
    const isPaid = o.payment_status === "paid";
    if (isPaid) {
      confirmedRevenueCents += o.total_paise;
      paidCount++;
    } else if (o.payment_status === "pending") pendingCount++;
    else if (o.payment_status === "cancelled") cancelledCount++;
    else if (o.payment_status === "failed") failedCount++;

    const division = o.division_slug || "unassigned";
    const bucket = (divisionThroughput[division] ??= { count: 0, totalQuantity: 0, revenueCents: 0 });
    bucket.count++;
    bucket.totalQuantity += (o.order_items ?? []).reduce((sum, it) => sum + it.quantity, 0);
    if (isPaid) bucket.revenueCents += o.total_paise;
  }

  return {
    currency: "INR",
    confirmedRevenueCents,
    confirmedRevenueFormatted: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(confirmedRevenueCents / 100),
    totalOrders: rows.length,
    paidCount,
    pendingCount,
    cancelledCount,
    failedCount,
    stageCounts,
    divisionThroughput,
  };
}

/** Archive (PRD § 11 capability 06): completed orders, searchable, files remain retrievable. */
export async function getArchivedOrders(options: {
  query?: string;
  customer?: string;
  product_type?: string;
  date_from?: string;
  date_to?: string;
}) {
  return searchAdminOrders({ ...options, stage: "COMPLETED", limit: 100 });
}

/** Records which proof version (and fingerprint) the customer approved for this order. */
export async function setOrderApprovedProof(orderId: string, version: number, sha256: string): Promise<void> {
  unwrap(
    await db().from("orders").update({ approved_proof_version: version, approved_proof_sha256: sha256 }).eq("id", orderId),
    "Record approved proof"
  );
}

/** A change request withdraws the earlier approval: production stays locked until a new proof is approved. */
export async function clearOrderApprovedProof(orderId: string): Promise<void> {
  unwrap(
    await db().from("orders").update({ approved_proof_version: null, approved_proof_sha256: null }).eq("id", orderId),
    "Clear approved proof"
  );
}
