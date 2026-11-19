import { NextRequest, NextResponse } from "next/server";
import { authClientForRoute } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  const supabase = authClientForRoute(req, response);
  // Revokes the refresh token server-side and clears the auth cookies on the response.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return response;
}
