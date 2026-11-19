import { db, unwrap } from "@/lib/supabase/server";
import { SavedDesign } from "@/types/database";

/** Saved designs repository (public.saved_designs). Always scoped to the owner. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DesignRow {
  id: string;
  customer_id: string;
  product_id: string;
  name: string;
  width_mm: number | string;
  height_mm: number | string;
  material_id: string;
  canvas_state: Record<string, unknown>;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
  products: { name: string; slug: string } | null;
}

function toDesign(row: DesignRow): SavedDesign & { product_slug: string } {
  return {
    id: row.id,
    customer_id: row.customer_id,
    product_id: row.product_id,
    product_slug: row.products?.slug ?? "",
    product_name: row.products?.name ?? row.product_id,
    name: row.name,
    width_mm: Number(row.width_mm),
    height_mm: Number(row.height_mm),
    material: row.material_id,
    canvas_state: row.canvas_state,
    preview_url: row.preview_url ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const DESIGN_COLUMNS = "*, products(name, slug)";

export async function getSavedDesignsForUser(userId: string, role: string = "customer") {
  let query = db().from("saved_designs").select(DESIGN_COLUMNS).order("created_at", { ascending: false });
  if (role !== "admin") {
    if (!UUID_RE.test(userId)) return [];
    query = query.eq("customer_id", userId);
  }
  const rows = unwrap(await query, "Load saved designs");
  return (rows as unknown as DesignRow[]).map(toDesign);
}

export async function getSavedDesignById(id: string) {
  if (!UUID_RE.test(id)) return null;
  const row = unwrap(await db().from("saved_designs").select(DESIGN_COLUMNS).eq("id", id).maybeSingle(), "Load saved design");
  return row ? toDesign(row as unknown as DesignRow) : null;
}

export async function saveDesign(design: {
  customer_id: string;
  product_id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  material: string;
  canvas_state: Record<string, unknown>;
  preview_url?: string;
}) {
  const row = unwrap(
    await db()
      .from("saved_designs")
      .insert({
        customer_id: design.customer_id,
        product_id: design.product_id,
        name: design.name,
        width_mm: design.width_mm,
        height_mm: design.height_mm,
        material_id: design.material,
        canvas_state: design.canvas_state,
        preview_url: design.preview_url || null,
      })
      .select(DESIGN_COLUMNS)
      .single(),
    "Save design"
  );
  return toDesign(row as unknown as DesignRow);
}

/** Deletes a design only if it belongs to userId. Returns false when not found/not owned. */
export async function deleteSavedDesign(id: string, userId: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = unwrap(
    await db().from("saved_designs").delete().eq("id", id).eq("customer_id", userId).select("id"),
    "Delete saved design"
  ) as Array<{ id: string }>;
  return rows.length > 0;
}
