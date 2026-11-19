import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createDraft, calculateDraftPrice, presentDraft } from "@/modules/drafts/draft-store";
import { getAuthUser } from "@/lib/server-auth";
import { ensureGuestToken, hashGuestToken } from "@/lib/draft-access";
import { PricingValidationError } from "@/modules/pricing/pricing-engine";

const CreateDraftSchema = z.object({
  productId: z.string().min(1),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  materialId: z.string().min(1),
  quantity: z.number().int().positive(),
  orientation: z.enum(["portrait", "landscape", "square"]).optional(),
});

/**
 * Creates a job draft owned by the signed-in customer, or by this browser's guest
 * cookie for visitors. Any customerId/customerEmail in the body is ignored.
 */
export async function POST(req: NextRequest) {
  const validated = CreateDraftSchema.safeParse(await req.json().catch(() => null));
  if (!validated.success) {
    return NextResponse.json(
      { error: "Invalid draft configuration", details: validated.error.format() },
      { status: 400 }
    );
  }

  try {
    const user = await getAuthUser(req);
    const response = NextResponse.json({});
    const guestToken = user ? null : ensureGuestToken(req, response);

    const draft = await createDraft({
      ...validated.data,
      customerId: user?.id ?? null,
      customerEmail: user?.email ?? null,
      guestTokenHash: guestToken ? hashGuestToken(guestToken) : null,
    });
    const pricing = await calculateDraftPrice(draft);

    return NextResponse.json({ draft: await presentDraft(draft), pricing }, { status: 201, headers: response.headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create draft";
    const status = err instanceof PricingValidationError ? 422 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
