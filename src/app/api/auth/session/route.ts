import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, toSafeUser } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ user: null, role: "visitor" });
    }
    return NextResponse.json({ user: toSafeUser(user), role: user.role });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Session error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
