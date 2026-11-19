import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { StoredUser } from "@/modules/auth/users-store";
import { JobDraft } from "@/types/draft";
import { getDraftGuestTokenHash } from "@/modules/drafts/draft-store";

/**
 * Ownership rules for job drafts.
 *
 * - A draft created by a signed-in customer belongs to that account.
 * - A draft created by a visitor belongs to the browser that holds the matching
 *   httpOnly guest cookie (only a SHA-256 of the token is stored).
 * - Admins may read and act on any draft.
 *
 * Identity is never taken from the request body.
 */

export const GUEST_COOKIE = "w2p_guest";

export function hashGuestToken(token: string): string {
  return crypto.createHash("sha256").update(`w2p-guest:${token}`).digest("hex");
}

export function readGuestToken(req: NextRequest): string | null {
  const value = req.cookies.get(GUEST_COOKIE)?.value;
  return value && value.length >= 16 ? value : null;
}

/** Returns the request's guest token, creating one (and setting the cookie on `res`) when missing. */
export function ensureGuestToken(req: NextRequest, res: NextResponse): string {
  const existing = readGuestToken(req);
  if (existing) return existing;
  const token = crypto.randomUUID();
  res.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return token;
}

export type DraftActor = { id: string; email: string; user: StoredUser | null; isAdmin: boolean };

type DraftAccess =
  | { ok: true; actor: DraftActor }
  | { ok: false; response: NextResponse };

/** Checks that the caller may act on `draft`; returns the actor to record in the audit trail. */
export async function authorizeDraft(req: NextRequest, draft: JobDraft): Promise<DraftAccess> {
  const user = await getAuthUser(req);

  if (user?.role === "admin") {
    return { ok: true, actor: { id: user.id, email: user.email, user, isAdmin: true } };
  }

  if (draft.customerId) {
    if (user && user.id === draft.customerId) {
      return { ok: true, actor: { id: user.id, email: user.email, user, isAdmin: false } };
    }
    return deny(user ? 403 : 401);
  }

  // Unowned (guest) draft: the caller must hold the guest cookie it was created with.
  const token = readGuestToken(req);
  const expected = await getDraftGuestTokenHash(draft.id);
  if (token && expected && hashGuestToken(token) === expected) {
    return {
      ok: true,
      actor: user
        ? { id: user.id, email: user.email, user, isAdmin: false }
        : { id: "guest", email: "guest@anonymous.local", user: null, isAdmin: false },
    };
  }
  return deny(user ? 403 : 401);
}

function deny(status: 401 | 403): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          status === 401
            ? "Unauthorized: sign in to access this job."
            : "Forbidden: you do not have permission to access this job.",
      },
      { status }
    ),
  };
}
