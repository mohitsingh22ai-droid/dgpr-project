import { db, unwrap } from "@/lib/supabase/server";
import { Product, PricingTier, Division, DivisionSlug } from "@/types/database";

/**
 * Catalogue repository — the single source of truth for divisions and products.
 * Prices are stored in paise; `*_cents` fields on the app types carry the same
 * minor-unit values until the Phase 3 money/GST refactor renames them.
 */

export interface ExtendedProduct extends Product {
  pricing_tiers: PricingTier[];
  gst_rate: number;
  hsn_code: string | null;
}

interface ProductRow {
  id: string;
  division_id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  base_price_paise: number;
  price_per_sq_cm_paise: number | string;
  gst_rate: number | string;
  hsn_code: string | null;
  min_width_mm: number;
  max_width_mm: number;
  min_height_mm: number;
  max_height_mm: number;
  default_width_mm: number;
  default_height_mm: number;
  default_bleed_mm: number | string;
  default_safety_margin_mm: number | string;
  allowed_materials: Product["allowed_materials"];
  allowed_orientations: Product["allowed_orientations"];
  pricing_tiers: PricingTier[];
  has_variable_data: boolean;
  variable_data_sample_headers: string[] | null;
  image_url: string | null;
  is_active: boolean;
  divisions: { slug: DivisionSlug } | null;
}

const PRODUCT_COLUMNS = "*, divisions(slug)";

function toProduct(row: ProductRow): ExtendedProduct {
  return {
    id: row.id,
    division_id: row.division_id,
    division_slug: row.divisions?.slug as DivisionSlug,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    base_price_cents: row.base_price_paise,
    price_per_sq_cm_cents: Number(row.price_per_sq_cm_paise),
    gst_rate: Number(row.gst_rate),
    hsn_code: row.hsn_code,
    min_width_mm: row.min_width_mm,
    max_width_mm: row.max_width_mm,
    min_height_mm: row.min_height_mm,
    max_height_mm: row.max_height_mm,
    default_width_mm: row.default_width_mm,
    default_height_mm: row.default_height_mm,
    default_bleed_mm: Number(row.default_bleed_mm),
    default_safety_margin_mm: Number(row.default_safety_margin_mm),
    allowed_materials: row.allowed_materials ?? [],
    allowed_orientations: row.allowed_orientations ?? ["portrait", "landscape", "square"],
    pricing_tiers: row.pricing_tiers ?? [],
    has_variable_data: row.has_variable_data,
    variable_data_sample_headers: row.variable_data_sample_headers ?? undefined,
    image_url: row.image_url ?? "",
    is_active: row.is_active,
  };
}

function toProductRow(p: Partial<ExtendedProduct>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const map: Array<[keyof ExtendedProduct, string]> = [
    ["division_id", "division_id"],
    ["slug", "slug"],
    ["name", "name"],
    ["subtitle", "subtitle"],
    ["description", "description"],
    ["base_price_cents", "base_price_paise"],
    ["price_per_sq_cm_cents", "price_per_sq_cm_paise"],
    ["gst_rate", "gst_rate"],
    ["hsn_code", "hsn_code"],
    ["min_width_mm", "min_width_mm"],
    ["max_width_mm", "max_width_mm"],
    ["min_height_mm", "min_height_mm"],
    ["max_height_mm", "max_height_mm"],
    ["default_width_mm", "default_width_mm"],
    ["default_height_mm", "default_height_mm"],
    ["default_bleed_mm", "default_bleed_mm"],
    ["default_safety_margin_mm", "default_safety_margin_mm"],
    ["allowed_materials", "allowed_materials"],
    ["allowed_orientations", "allowed_orientations"],
    ["pricing_tiers", "pricing_tiers"],
    ["has_variable_data", "has_variable_data"],
    ["variable_data_sample_headers", "variable_data_sample_headers"],
    ["image_url", "image_url"],
    ["is_active", "is_active"],
  ];
  for (const [from, to] of map) {
    if (p[from] !== undefined) row[to] = p[from];
  }
  return row;
}

export async function getAllProducts(options: { includeInactive?: boolean } = {}): Promise<ExtendedProduct[]> {
  let query = db().from("products").select(PRODUCT_COLUMNS).order("division_id").order("name");
  if (!options.includeInactive) query = query.eq("is_active", true);
  const rows = unwrap(await query, "Load products");
  return (rows as ProductRow[]).map(toProduct);
}

/** Looks a product up by id, falling back to slug. Returns null when unknown. */
export async function getProductById(idOrSlug: string): Promise<ExtendedProduct | null> {
  const byId = unwrap(
    await db().from("products").select(PRODUCT_COLUMNS).eq("id", idOrSlug).maybeSingle(),
    "Load product"
  );
  if (byId) return toProduct(byId as ProductRow);
  return getProductBySlug(idOrSlug);
}

export async function getProductBySlug(slug: string): Promise<ExtendedProduct | null> {
  const row = unwrap(
    await db().from("products").select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle(),
    "Load product by slug"
  );
  return row ? toProduct(row as ProductRow) : null;
}

export async function getAllDivisions(): Promise<Division[]> {
  const rows = unwrap(
    await db().from("divisions").select("*").eq("is_active", true).order("order_index"),
    "Load divisions"
  );
  return rows as Division[];
}

export function validatePricingTiers(tiers: PricingTier[]): { valid: boolean; error?: string } {
  if (!Array.isArray(tiers)) {
    return { valid: false, error: "Pricing tiers must be an array." };
  }

  const seenQuantities = new Set<number>();
  for (const tier of tiers) {
    if (!Number.isInteger(tier.min_quantity) || tier.min_quantity <= 0) {
      return { valid: false, error: "Tier min_quantity must be a positive integer greater than 0." };
    }
    if (typeof tier.discount_percentage !== "number" || tier.discount_percentage < 0 || tier.discount_percentage > 100) {
      return { valid: false, error: "Tier discount_percentage must be a number between 0 and 100." };
    }
    if (seenQuantities.has(tier.min_quantity)) {
      return { valid: false, error: `Duplicate tier floor detected for quantity ${tier.min_quantity}. Overlaps are not permitted.` };
    }
    seenQuantities.add(tier.min_quantity);
  }
  return { valid: true };
}

function validateProductFields(p: Partial<ExtendedProduct>): string | null {
  if (p.base_price_cents !== undefined && p.base_price_cents < 0) return "Base price cannot be negative.";
  if (p.price_per_sq_cm_cents !== undefined && p.price_per_sq_cm_cents < 0) return "Price per sq cm cannot be negative.";
  if (p.min_width_mm !== undefined && p.min_width_mm <= 0) return "Minimum width must be greater than 0 mm.";
  if (p.min_height_mm !== undefined && p.min_height_mm <= 0) return "Minimum height must be greater than 0 mm.";
  if (p.gst_rate !== undefined && ![0, 5, 12, 18, 28].includes(Number(p.gst_rate))) return "GST rate must be one of 0, 5, 12, 18 or 28%.";
  if (p.hsn_code !== undefined && p.hsn_code !== null && !/^\d{4,8}$/.test(p.hsn_code)) return "HSN code must be 4 to 8 digits.";
  if (p.max_width_mm !== undefined && p.min_width_mm !== undefined && p.max_width_mm < p.min_width_mm) return "Maximum width must not be below the minimum.";
  if (p.max_height_mm !== undefined && p.min_height_mm !== undefined && p.max_height_mm < p.min_height_mm) return "Maximum height must not be below the minimum.";
  if (p.pricing_tiers !== undefined) {
    const tiers = validatePricingTiers(p.pricing_tiers);
    if (!tiers.valid) return tiers.error!;
  }
  return null;
}

export async function updateProduct(
  id: string,
  updates: Partial<ExtendedProduct>
): Promise<{ success: boolean; product?: ExtendedProduct; error?: string }> {
  const existing = await getProductById(id);
  if (!existing) return { success: false, error: `Product with ID '${id}' not found.` };

  const problem = validateProductFields(updates);
  if (problem) return { success: false, error: problem };

  // id is immutable; everything else maps through the column whitelist.
  const { error } = await db().from("products").update(toProductRow(updates)).eq("id", existing.id);
  if (error) return { success: false, error: error.message };

  const product = await getProductById(existing.id);
  return { success: true, product: product! };
}

export async function createProduct(
  productData: Partial<ExtendedProduct> & { id?: string }
): Promise<{ success: boolean; product?: ExtendedProduct; error?: string }> {
  if (!productData.slug || !productData.name || !productData.division_id) {
    return { success: false, error: "Product slug, name and division are required." };
  }
  if (await getProductBySlug(productData.slug)) {
    return { success: false, error: `Product with slug '${productData.slug}' already exists.` };
  }

  const problem = validateProductFields(productData);
  if (problem) return { success: false, error: problem };

  const id = productData.id || `prod-${productData.slug}`;
  const row = {
    id,
    base_price_paise: 0,
    price_per_sq_cm_paise: 0,
    min_width_mm: 20,
    max_width_mm: 1000,
    min_height_mm: 20,
    max_height_mm: 1000,
    default_width_mm: 75,
    default_height_mm: 75,
    ...toProductRow(productData),
  };

  const { error } = await db().from("products").insert(row);
  if (error) return { success: false, error: error.message };

  const product = await getProductById(id);
  return { success: true, product: product! };
}
