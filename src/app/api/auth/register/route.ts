import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authClientForRoute } from "@/lib/supabase/server";
import { registerCustomerUser, validatePasswordStrength } from "@/modules/auth/users-store";
import { toSafeUser } from "@/lib/server-auth";

const RegisterSchema = z.object({
  email: z.string().trim().email("A valid email address is required."),
  password: z.string(),
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  companyName: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(32).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = RegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Email, password, and full name are required.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { email, password, fullName, companyName, phone } = parsed.data;
  const passwordProblem = validatePasswordStrength(password);
  if (passwordProblem) {
    return NextResponse.json({ error: passwordProblem }, { status: 400 });
  }

  // Public signup always creates a customer; the role is set by the database.
  const result = await registerCustomerUser(email, password, { fullName, companyName, phone });
  if (!result.success || !result.user) {
    const status = result.error?.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: result.error || "Registration failed." }, { status });
  }

  // Sign the new customer in so the session cookies are set.
  const response = NextResponse.json({});
  const supabase = authClientForRoute(req, response);
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
  if (error || !data.session) {
    return NextResponse.json({ error: "Account created. Please sign in." }, { status: 201 });
  }

  return NextResponse.json(
    { success: true, user: toSafeUser(result.user), token: data.session.access_token },
    { status: 201, headers: response.headers }
  );
}
