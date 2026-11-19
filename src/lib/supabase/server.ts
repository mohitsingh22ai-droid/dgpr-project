import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Server-side Supabase clients. NEVER import this module from a client component:
 * the service-role key bypasses row-level security.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

let serviceClient: SupabaseClient | null = null;

/**
 * Service-role client used by repositories. Authorisation (ownership, roles) is
 * enforced by the calling service code, never by trusting request input.
 */
export function db(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return serviceClient;
}

/**
 * Publishable-key client bound to the request/response cookies. Used only for
 * Supabase Auth flows (sign in, sign out, session refresh) so that the auth
 * cookies are read from the request and written to the response.
 */
export function authClientForRoute(req: NextRequest, res: NextResponse): SupabaseClient {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies: Array<{ name: string; value: string; options: CookieOptions }>) => {
          for (const { name, value, options } of cookies) {
            res.cookies.set(name, value, options);
          }
        },
      },
    }
  );
}

/** Throws a readable error when a Supabase call fails. */
export function unwrap<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}
