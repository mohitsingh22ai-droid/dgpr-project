import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { getSavedDesignById, deleteSavedDesign } from "@/modules/designs/saved-designs-store";

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

    const design = await getSavedDesignById(id);
    if (!design) {
      return NextResponse.json({ error: "Saved design not found" }, { status: 404 });
    }

    if (sessionUser.role !== "admin" && design.customer_id !== sessionUser.id) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to view this design" },
        { status: 403 }
      );
    }

    return NextResponse.json({ design });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to load saved design";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
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

    const deleted = await deleteSavedDesign(id, sessionUser.id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Design not found or not owned by you" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Design deleted" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to delete saved design";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
