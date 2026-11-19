/**
 * Development / test seed for the Supabase project.
 *
 *   npm run seed
 *
 * - Upserts the six divisions and the product catalogue (INR prices in paise).
 * - Ensures the demo accounts exist (customers + one admin) with known dev passwords.
 * - Resets the demo accounts' data (orders, drafts, proofs, designs, email logs) and
 *   recreates a small, known set of demo orders.
 * - Removes accounts created by automated tests (see isTestAccountEmail).
 *
 * Data that belongs to any other account is never touched.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { db, unwrap } from "@/lib/supabase/server";
import { DIVISIONS, PRODUCTS, VOLUME_DISCOUNTS } from "@/lib/data/mock-data";
import { calculatePrintPrice } from "@/modules/pricing/pricing-engine";
import { getProductById, ExtendedProduct } from "@/modules/catalog/catalog-store";
import { PipelineStage } from "@/types/database";
import { DraftStatus } from "@/types/draft";

/** INR catalogue pricing (paise) and tax data. Review with the business before launch. */
const INR_CATALOGUE: Record<string, { base: number; perSqCm: number; gstRate: number; hsn: string }> = {
  "prod-vinyl-sticker": { base: 400, perSqCm: 25, gstRate: 18, hsn: "4821" },
  "prod-race-bib": { base: 1000, perSqCm: 8, gstRate: 18, hsn: "4911" },
  "prod-mtb-plate": { base: 8000, perSqCm: 50, gstRate: 18, hsn: "3926" },
  "prod-stamps-selfink": { base: 45000, perSqCm: 500, gstRate: 18, hsn: "9611" },
  "prod-trophy-plate": { base: 15000, perSqCm: 200, gstRate: 18, hsn: "8306" },
  "prod-laser-acrylic": { base: 12000, perSqCm: 150, gstRate: 18, hsn: "3926" },
};

export const SEED_PASSWORDS = { admin: "admin123", customer: "customer123" } as const;

export const SEED_ACCOUNTS = [
  { key: "admin", email: "admin@w2p.co.in", fullName: "Marcus Vance (Production Head)", company: "W2P Print House", phone: "+91 11 4000 0000", role: "admin" as const },
  { key: "customerA", email: "sarah@enduroclub.uk", fullName: "Sarah Jenkins", company: "Grizedale Enduro Racing", phone: "+44 7911 123456", role: "customer" as const },
  { key: "customerB", email: "customerb@example.com", fullName: "Customer B", company: "Apex Biking Co", phone: "+91 98100 22333", role: "customer" as const },
  { key: "customerC", email: "customerc@example.com", fullName: "Customer C", company: "Lakeside Events", phone: "+91 98100 44555", role: "customer" as const },
];

/** Accounts created by automated tests; removed on every seed run. */
export function isTestAccountEmail(email: string): boolean {
  return (
    /@testdomain\.co\.uk$/i.test(email) ||
    /@e2e\.w2p\.test$/i.test(email) ||
    /^plain-\d+@example\.com$/i.test(email)
  );
}

const DELHI_ADDRESS = { line1: "14 Okhla Industrial Estate, Phase III", city: "New Delhi", postal_code: "110020", country: "India" };
const MUMBAI_ADDRESS = { line1: "7 Marol Naka, Andheri East", city: "Mumbai", postal_code: "400059", country: "India" };

interface SeedOrder {
  orderNumber: string;
  owner: "customerA" | "customerB" | "customerC";
  stage: PipelineStage;
  payment: "pending" | "paid" | "cancelled";
  productId: string;
  widthMm: number;
  heightMm: number;
  materialId: string;
  quantity: number;
  proofApproved: boolean;
  address: typeof DELHI_ADDRESS;
  createdAt: string;
}

const SEED_ORDERS: SeedOrder[] = [
  { orderNumber: "W2P-2026-00101", owner: "customerA", stage: "PRODUCTION", payment: "paid", productId: "prod-vinyl-sticker", widthMm: 75, heightMm: 75, materialId: "gloss-white", quantity: 100, proofApproved: true, address: DELHI_ADDRESS, createdAt: "2026-03-01T10:00:00.000Z" },
  { orderNumber: "W2P-2026-00102", owner: "customerA", stage: "ORDER", payment: "pending", productId: "prod-vinyl-sticker", widthMm: 50, heightMm: 50, materialId: "matte-white", quantity: 50, proofApproved: true, address: DELHI_ADDRESS, createdAt: "2026-03-02T11:00:00.000Z" },
  { orderNumber: "W2P-2026-00201", owner: "customerB", stage: "COMPLETED", payment: "paid", productId: "prod-race-bib", widthMm: 210, heightMm: 148, materialId: "tyvek-54gsm", quantity: 200, proofApproved: true, address: MUMBAI_ADDRESS, createdAt: "2026-03-03T09:00:00.000Z" },
  { orderNumber: "W2P-2026-00202", owner: "customerB", stage: "QUOTE", payment: "cancelled", productId: "prod-mtb-plate", widthMm: 175, heightMm: 155, materialId: "polyprop-08", quantity: 50, proofApproved: false, address: MUMBAI_ADDRESS, createdAt: "2026-03-05T08:00:00.000Z" },
  { orderNumber: "W2P-2026-00301", owner: "customerC", stage: "QUOTE", payment: "pending", productId: "prod-stamps-selfink", widthMm: 58, heightMm: 22, materialId: "", quantity: 5, proofApproved: false, address: DELHI_ADDRESS, createdAt: "2026-03-06T08:00:00.000Z" },
  { orderNumber: "W2P-2026-00302", owner: "customerC", stage: "ARTWORK", payment: "paid", productId: "prod-trophy-plate", widthMm: 75, heightMm: 25, materialId: "", quantity: 12, proofApproved: false, address: DELHI_ADDRESS, createdAt: "2026-03-07T08:00:00.000Z" },
];

async function seedCatalogue(): Promise<void> {
  unwrap(
    await db().from("divisions").upsert(
      DIVISIONS.map((d) => ({
        id: d.id,
        slug: d.slug,
        name: d.name,
        tagline: d.tagline,
        description: d.description,
        icon: d.icon,
        accent_color: d.accent_color,
        banner_image: d.banner_image ?? null,
        is_active: d.is_active,
        order_index: d.order_index,
      }))
    ),
    "Seed divisions"
  );

  unwrap(
    await db().from("products").upsert(
      PRODUCTS.map((p) => {
        const inr = INR_CATALOGUE[p.id];
        if (!inr) throw new Error(`No INR pricing defined for ${p.id}`);
        return {
          id: p.id,
          division_id: p.division_id,
          slug: p.slug,
          name: p.name,
          subtitle: p.subtitle,
          description: p.description,
          base_price_paise: inr.base,
          price_per_sq_cm_paise: inr.perSqCm,
          gst_rate: inr.gstRate,
          hsn_code: inr.hsn,
          min_width_mm: p.min_width_mm,
          max_width_mm: p.max_width_mm,
          min_height_mm: p.min_height_mm,
          max_height_mm: p.max_height_mm,
          default_width_mm: p.default_width_mm,
          default_height_mm: p.default_height_mm,
          default_bleed_mm: p.default_bleed_mm,
          default_safety_margin_mm: p.default_safety_margin_mm,
          allowed_materials: p.allowed_materials,
          allowed_orientations: p.allowed_orientations,
          pricing_tiers: VOLUME_DISCOUNTS,
          has_variable_data: p.has_variable_data,
          variable_data_sample_headers: p.variable_data_sample_headers ?? null,
          image_url: p.image_url,
          is_active: p.is_active,
        };
      })
    ),
    "Seed products"
  );
}

async function listAllAuthUsers(): Promise<Array<{ id: string; email?: string }>> {
  const users: Array<{ id: string; email?: string }> = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`List auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

async function deleteAccountData(userIds: string[], emails: string[]): Promise<void> {
  if (userIds.length === 0) return;
  // Orders restrict deletion of their owner; drafts/designs/proofs cascade.
  unwrap(await db().from("drafts").update({ order_id: null }).in("customer_id", userIds), "Unlink drafts");
  unwrap(await db().from("orders").delete().in("customer_id", userIds), "Delete orders");
  unwrap(await db().from("drafts").delete().in("customer_id", userIds), "Delete drafts");
  unwrap(await db().from("saved_designs").delete().in("customer_id", userIds), "Delete designs");
  if (emails.length > 0) {
    unwrap(await db().from("email_logs").delete().in("recipient", emails), "Delete email logs");
  }
}

async function ensureAccounts(existing: Array<{ id: string; email?: string }>): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const account of SEED_ACCOUNTS) {
    const password = account.role === "admin" ? SEED_PASSWORDS.admin : SEED_PASSWORDS.customer;
    const found = existing.find((u) => u.email?.toLowerCase() === account.email);
    let id = found?.id;

    if (id) {
      const { error } = await db().auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw new Error(`Reset password for ${account.email}: ${error.message}`);
    } else {
      const { data, error } = await db().auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName, company_name: account.company, phone: account.phone },
      });
      if (error || !data.user) throw new Error(`Create ${account.email}: ${error?.message}`);
      id = data.user.id;
    }

    unwrap(
      await db()
        .from("profiles")
        .upsert({
          id,
          email: account.email,
          full_name: account.fullName,
          company_name: account.company,
          phone: account.phone,
          role: account.role,
          is_active: true,
        }),
      `Profile for ${account.email}`
    );
    ids[account.key] = id;
  }
  return ids;
}

async function seedOrders(ids: Record<string, string>): Promise<void> {
  const productCache = new Map<string, ExtendedProduct>();
  for (const seed of SEED_ORDERS) {
    const product = productCache.get(seed.productId) ?? (await getProductById(seed.productId));
    if (!product) throw new Error(`Seed product ${seed.productId} missing`);
    productCache.set(product.id, product);

    const account = SEED_ACCOUNTS.find((a) => a.key === seed.owner)!;
    const materialId = seed.materialId || product.allowed_materials[0]?.id || "standard";
    const material = product.allowed_materials.find((m) => m.id === materialId) ?? product.allowed_materials[0];
    const price = calculatePrintPrice({ product, widthMm: seed.widthMm, heightMm: seed.heightMm, materialId, quantity: seed.quantity });
    const draftStatus: DraftStatus = seed.payment === "paid" ? "paid" : seed.proofApproved ? "proof_approved" : "proof_pending";

    const draft = unwrap(
      await db()
        .from("drafts")
        .insert({
          product_id: product.id,
          customer_id: ids[seed.owner],
          customer_email: account.email,
          status: draftStatus,
          quantity: seed.quantity,
          options: {
            widthMm: seed.widthMm,
            heightMm: seed.heightMm,
            materialId,
            orientation: "landscape",
            bleedMm: product.default_bleed_mm,
            safetyMarginMm: product.default_safety_margin_mm,
          },
          created_at: seed.createdAt,
        })
        .select("id")
        .single(),
      "Seed draft"
    ) as { id: string };

    unwrap(
      await db().from("draft_proofs").insert({
        draft_id: draft.id,
        version: 1,
        status: seed.proofApproved ? "approved" : "pending_review",
        rendered_url: product.image_url,
        sha256: "seed",
        approved_by: seed.proofApproved ? ids[seed.owner] : null,
        approved_by_email: seed.proofApproved ? account.email : null,
        approved_at: seed.proofApproved ? seed.createdAt : null,
        created_at: seed.createdAt,
      }),
      "Seed proof"
    );

    const tax = price.taxCents;
    const cgst = Math.floor(tax / 2);
    const order = unwrap(
      await db()
        .from("orders")
        .insert({
          order_number: seed.orderNumber,
          customer_id: ids[seed.owner],
          customer_email: account.email,
          customer_name: account.fullName,
          draft_id: draft.id,
          division_slug: product.division_slug,
          pipeline_stage: seed.stage,
          payment_status: seed.payment,
          currency: "INR",
          subtotal_paise: price.subtotalCents,
          cgst_paise: cgst,
          sgst_paise: tax - cgst,
          igst_paise: 0,
          tax_paise: tax,
          total_paise: price.subtotalCents + tax,
          place_of_supply: seed.address.city === "Mumbai" ? "27" : "07",
          shipping_address: { name: account.fullName, ...seed.address },
          approved_proof_version: seed.proofApproved ? 1 : null,
          created_at: seed.createdAt,
        })
        .select("id")
        .single(),
      "Seed order"
    ) as { id: string };

    unwrap(await db().from("drafts").update({ order_id: order.id }).eq("id", draft.id), "Link draft");
    unwrap(
      await db().from("order_items").insert({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        division_slug: product.division_slug,
        hsn_code: product.hsn_code,
        width_mm: seed.widthMm,
        height_mm: seed.heightMm,
        material_id: materialId,
        material_name: material?.name ?? materialId,
        quantity: seed.quantity,
        unit_price_paise: price.discountedUnitPriceCents,
        line_subtotal_paise: price.subtotalCents,
        gst_rate: product.gst_rate,
        artwork_type: "designer",
      }),
      "Seed order item"
    );
    unwrap(
      await db().from("order_events").insert({
        order_id: order.id,
        from_stage: "QUOTE",
        to_stage: seed.stage,
        changed_by: "seed",
        notes: "Seeded demo order",
        created_at: seed.createdAt,
      }),
      "Seed order event"
    );
  }

  // One saved design for Customer A.
  unwrap(
    await db().from("saved_designs").insert({
      customer_id: ids.customerA,
      product_id: "prod-vinyl-sticker",
      name: "Enduro Club Brand Stickers",
      width_mm: 75,
      height_mm: 75,
      material_id: "gloss-white",
      canvas_state: {},
      preview_url: PRODUCTS[0].image_url,
    }),
    "Seed saved design"
  );
}

export async function seedDatabase(): Promise<void> {
  await seedCatalogue();

  const authUsers = await listAllAuthUsers();
  const seedEmails = SEED_ACCOUNTS.map((a) => a.email);
  const seedUserIds = authUsers.filter((u) => u.email && seedEmails.includes(u.email.toLowerCase())).map((u) => u.id);
  const testUsers = authUsers.filter((u) => u.email && isTestAccountEmail(u.email));

  await deleteAccountData(
    [...seedUserIds, ...testUsers.map((u) => u.id)],
    [...seedEmails, ...testUsers.map((u) => u.email!.toLowerCase())]
  );
  for (const user of testUsers) {
    const { error } = await db().auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Delete test account ${user.email}: ${error.message}`);
  }

  const ids = await ensureAccounts(authUsers);
  await seedOrders(ids);
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log("Seed complete: catalogue, demo accounts and demo orders are in place.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
