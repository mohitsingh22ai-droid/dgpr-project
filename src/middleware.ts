import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const GUEST_COOKIE = "w2p_guest";

/**
 * 1. Keeps the Supabase session fresh (rotates auth cookies when the access token expires).
 * 2. Guards the admin console: /production is served only to active admins.
 *    API routes perform their own full authorisation checks; this is the page-level gate.
 */
export async function middleware(req: NextRequest) {
  // Every browser gets an anonymous, httpOnly guest token so a visitor can own the
  // job drafts they create before signing in. It is added to the request too, so
  // server components and route handlers see it on the very first visit.
  const newGuestToken = req.cookies.get(GUEST_COOKIE) ? null : crypto.randomUUID();
  if (newGuestToken) req.cookies.set(GUEST_COOKIE, newGuestToken);

  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies: Array<{ name: string; value: string; options: CookieOptions }>) => {
          for (const { name, value } of cookies) req.cookies.set(name, value);
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        },
      },
    }
  );

  // Validates the session with Supabase Auth and refreshes cookies if needed.
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (req.nextUrl.pathname.startsWith("/production")) {
    if (!user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!(await isActiveAdmin(user.id))) {
      return NextResponse.rewrite(new URL("/forbidden", req.url), { status: 403 });
    }
  }

  if (newGuestToken) {
    response.cookies.set(GUEST_COOKIE, newGuestToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

async function isActiveAdmin(userId: string): Promise<boolean> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role,is_active`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) return false;
  const rows = (await res.json()) as Array<{ role: string; is_active: boolean }>;
  return rows[0]?.role === "admin" && rows[0]?.is_active === true;
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
