import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authClientForRoute } from "@/lib/supabase/server";
import { getUserById } from "@/modules/auth/users-store";
import { toSafeUser } from "@/lib/server-auth";

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const INVALID = "Invalid email or password.";

export async function POST(req: NextRequest) {
  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  // Auth cookies are written onto this response by the Supabase client.
  const response = NextResponse.json({});
  const supabase = authClientForRoute(req, response);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error && (error.status === 429 || /rate limit/i.test(error.message) || error.code === "over_request_rate_limit")) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }
  if (error || !data.user || !data.session) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const user = await getUserById(data.user.id);
  if (!user) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }
  if (!user.isActive) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "Account has been deactivated. Please contact an administrator." },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { success: true, user: toSafeUser(user), token: data.session.access_token },
    { status: 200, headers: response.headers }
  );
}
