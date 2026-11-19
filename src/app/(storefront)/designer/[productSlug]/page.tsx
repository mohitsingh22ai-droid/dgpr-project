import React from "react";
import { notFound } from "next/navigation";
import { DesignerPageView } from "@/modules/designer/components/designer-page-view";
import { getDraft, getDraftGuestTokenHash } from "@/modules/drafts/draft-store";
import { getPageUser, getPageGuestToken } from "@/lib/server-auth";
import { getSavedDesignById } from "@/modules/designs/saved-designs-store";
import { hashGuestToken } from "@/lib/draft-access";
import { validateConfiguration } from "@/modules/pricing/pricing-engine";
import { getProductBySlug } from "@/modules/catalog/catalog-store";

// Always rendered per request: every visit works on its own draft.
export const dynamic = "force-dynamic";

export default async function DesignerPage({
  params,
  searchParams,
}: {
  params: Promise<{ productSlug: string }>;
  searchParams: Promise<{ draft?: string; design?: string; w?: string; h?: string; mat?: string; qty?: string }>;
}) {
  const { productSlug } = await params;
  const sParams = await searchParams;

  const product = await getProductBySlug(productSlug);
  if (!product || !product.is_active) {
    notFound();
  }

  // Reopen an existing draft only if this visitor owns it; otherwise start a new one.
  const [user, guestToken] = await Promise.all([getPageUser(), getPageGuestToken()]);
  let draft = sParams.draft ? await getDraft(sParams.draft) : null;
  if (draft) {
    const ownsDraft = draft.customerId
      ? user?.id === draft.customerId || user?.role === "admin"
      : Boolean(guestToken) && hashGuestToken(guestToken!) === (await getDraftGuestTokenHash(draft.id));
    if (!ownsDraft || draft.productId !== product.id) draft = null;
  }

  // A saved design from the customer's library seeds a new job (size, material, artwork).
  const savedDesign =
    !draft && sParams.design && user ? await getSavedDesignById(sParams.design) : null;
  const design = savedDesign && savedDesign.customer_id === user?.id && savedDesign.product_id === product.id ? savedDesign : null;
  if (design) {
    sParams.w = String(design.width_mm);
    sParams.h = String(design.height_mm);
    sParams.mat = design.material;
  }

  // No draft is created just by viewing the designer: the client creates one the
  // first time the customer generates a proof, uploads artwork or approves.
  const requested = {
    widthMm: Number(sParams.w) || product.default_width_mm,
    heightMm: Number(sParams.h) || product.default_height_mm,
    materialId: sParams.mat || product.allowed_materials[0]?.id || "default",
    quantity: Number(sParams.qty) || 100,
  };
  const config = draft
    ? { widthMm: draft.options.widthMm, heightMm: draft.options.heightMm, materialId: draft.options.materialId, quantity: draft.quantity }
    : validateConfiguration(product, requested)
      ? {
          widthMm: product.default_width_mm,
          heightMm: product.default_height_mm,
          materialId: product.allowed_materials[0]?.id || "default",
          quantity: 100,
        }
      : requested;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <DesignerPageView
        product={product}
        draftId={draft?.id}
        initialDesign={draft?.designJson ?? design?.canvas_state ?? null}
        initialWidthMm={config.widthMm}
        initialHeightMm={config.heightMm}
        selectedMaterialId={config.materialId}
        quantity={config.quantity}
      />
    </div>
  );
}
