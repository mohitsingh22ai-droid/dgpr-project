import { resolveStoredUrl } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { getProofById } from "@/modules/proofs/proofs-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionUser = await getAuthUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Unauthorized: Valid session required" },
        { status: 401 }
      );
    }

    const proof = await getProofById(id);
    if (!proof) {
      return NextResponse.json({ error: "Proof not found" }, { status: 404 });
    }

    if (sessionUser.role !== "admin") {
      const isOwner = proof.customer_id === sessionUser.id;

      if (!isOwner) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to view this proof" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ proof: { ...proof, watermarked_preview_url: await resolveStoredUrl(proof.watermarked_preview_url) } });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to load proof";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
