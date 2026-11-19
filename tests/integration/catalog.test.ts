import { describe, it, after } from "node:test";
import assert from "node:assert";
import { hasDatabase } from "./helpers";
import { getAllProducts, getAllDivisions, getProductById, updateProduct } from "@/modules/catalog/catalog-store";
import { createDraft, calculateDraftPrice } from "@/modules/drafts/draft-store";
import { db } from "@/lib/supabase/server";

describe("Catalogue (PRD § 04, § 11)", { skip: !hasDatabase }, () => {
  const draftIds: string[] = [];
  let originalTiers: Awaited<ReturnType<typeof getProductById>> = null;

  after(async () => {
    if (originalTiers) await updateProduct(originalTiers.id, { pricing_tiers: originalTiers.pricing_tiers });
    if (draftIds.length) await db().from("drafts").delete().in("id", draftIds);
  });

  it("serves the six divisions and every product with INR pricing and GST data", async () => {
    const divisions = await getAllDivisions();
    assert.strictEqual(divisions.length, 6);
    const products = await getAllProducts();
    assert.ok(products.length >= 6);
    for (const p of products) {
      assert.ok(p.division_slug, `${p.id} has a division`);
      assert.ok(p.gst_rate >= 0 && p.gst_rate <= 28);
      assert.ok(p.pricing_tiers.length > 0);
    }
  });

  it("finds products by id or slug and returns null for unknown ones", async () => {
    assert.strictEqual((await getProductById("prod-vinyl-sticker"))?.slug, "custom-die-cut-vinyl");
    assert.strictEqual((await getProductById("custom-die-cut-vinyl"))?.id, "prod-vinyl-sticker");
    assert.strictEqual(await getProductById("does-not-exist"), null);
  });

  it("admin tier edits take effect on the next price calculation, without a redeploy", async () => {
    originalTiers = await getProductById("prod-vinyl-sticker");
    const draft = await createDraft({ productId: "prod-vinyl-sticker", widthMm: 75, heightMm: 75, materialId: "gloss-white", quantity: 100 });
    draftIds.push(draft.id);

    await updateProduct("prod-vinyl-sticker", { pricing_tiers: [{ min_quantity: 1, discount_percentage: 0 }, { min_quantity: 100, discount_percentage: 33 }] });
    assert.strictEqual((await calculateDraftPrice(draft)).discountPercentage, 33);

    const rejected = await updateProduct("prod-vinyl-sticker", { pricing_tiers: [{ min_quantity: 10, discount_percentage: 150 }] });
    assert.strictEqual(rejected.success, false);
  });
});
