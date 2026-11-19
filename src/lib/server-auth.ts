import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/supabase/server";
import { getUserById, StoredUser } from "@/modules/auth/users-store";

/**
 * Resolves the signed-in user for an API request.
 *
 * Identity comes ONLY from a verified Supabase session:
 *   1. `Authorization: Bearer <access token>` (API clients, future mobile app, tests)
 *   2. the Supabase auth cookies set by /api/auth/login
 * The token is verified with Supabase Auth; the role and active flag come from
 * public.profiles. Nothing in the request body or query string is trusted.
 */
export async function getAuthUser(req: NextRequest): Promise<StoredUser | null> {
  const userId = await resolveAuthUserId(req);
  if (!userId) return null;

  const user = await getUserById(userId);
  if (!user || !user.isActive) return null;
  return user;
}

async function resolveAuthUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    const { data, error } = await db().auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        // Session refresh is handled by middleware; route handlers only read.
        setAll: () => undefined,
      },
    }
  );
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

type Guard =
  | { authorized: true; user: StoredUser; response?: undefined }
  | { authorized: false; user?: undefined; response: NextResponse };

export async function requireAuth(req: NextRequest): Promise<Guard> {
  const user = await getAuthUser(req);
  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized: Valid session required" }, { status: 401 }),
    };
  }
  return { authorized: true, user };
}

export async function requireAdmin(req: NextRequest): Promise<Guard> {
  const auth = await requireAuth(req);
  if (!auth.authorized) return auth;
  if (auth.user.role !== "admin") {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 }),
    };
  }
  return auth;
}

/** Public projection of a user; never includes internal flags. */
export function toSafeUser(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    company_name: user.company_name,
    phone: user.phone,
    created_at: user.created_at,
  };
}

/**
 * Signed-in user for server components (pages), read from the request cookies.
 * Session refresh happens in middleware; this only reads.
 */
export async function getPageUser(): Promise<StoredUser | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined } }
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = await getUserById(data.user.id);
  return user?.isActive ? user : null;
}

/** The visitor's guest token for server components (set by middleware). */
export async function getPageGuestToken(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  return (await cookies()).get("w2p_guest")?.value ?? null;
}
