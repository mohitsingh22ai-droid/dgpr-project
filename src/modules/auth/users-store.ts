import { db, unwrap } from "@/lib/supabase/server";
import { Profile, UserRole } from "@/types/database";

/**
 * User accounts live in Supabase Auth (credentials) + public.profiles (role, contact
 * details, active flag). Passwords are never stored or compared by this application.
 */

export interface StoredUser extends Profile {
  isActive: boolean;
  orderCount?: number;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  role: "customer" | "admin";
  is_active: boolean;
  created_at: string;
}

const PROFILE_COLUMNS = "id, email, full_name, company_name, phone, role, is_active, created_at";

function toUser(row: ProfileRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    company_name: row.company_name,
    phone: row.phone,
    role: row.role,
    isActive: row.is_active,
    created_at: row.created_at,
  };
}

export async function getAllUsers(): Promise<StoredUser[]> {
  const rows = unwrap(
    await db().from("profiles").select(PROFILE_COLUMNS).order("created_at", { ascending: true }),
    "Load users"
  );
  return (rows as ProfileRow[]).map(toUser);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getUserById(id: string): Promise<StoredUser | null> {
  if (!UUID_RE.test(id)) return null;
  const row = unwrap(
    await db().from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle(),
    "Load user"
  );
  return row ? toUser(row as ProfileRow) : null;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const row = unwrap(
    await db().from("profiles").select(PROFILE_COLUMNS).eq("email", email.toLowerCase().trim()).maybeSingle(),
    "Load user by email"
  );
  return row ? toUser(row as ProfileRow) : null;
}

async function countActiveAdmins(): Promise<number> {
  const { count, error } = await db()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);
  if (error) throw new Error(`Count admins: ${error.message}`);
  return count ?? 0;
}

export async function updateUserRole(
  adminUserId: string,
  targetUserId: string,
  newRole: UserRole
): Promise<{ success: boolean; user?: StoredUser; error?: string }> {
  if (newRole !== "customer" && newRole !== "admin") {
    return { success: false, error: "Invalid role." };
  }

  const target = await getUserById(targetUserId);
  if (!target) return { success: false, error: "Target user not found" };

  if (adminUserId === targetUserId && newRole !== "admin") {
    return { success: false, error: "You cannot demote your own admin account." };
  }
  if (target.role === "admin" && newRole !== "admin" && target.isActive && (await countActiveAdmins()) <= 1) {
    return { success: false, error: "Cannot demote the last active administrator." };
  }

  const row = unwrap(
    await db().from("profiles").update({ role: newRole }).eq("id", targetUserId).select(PROFILE_COLUMNS).single(),
    "Update role"
  );
  return { success: true, user: toUser(row as ProfileRow) };
}

export async function updateUserStatus(
  adminUserId: string,
  targetUserId: string,
  isActive: boolean
): Promise<{ success: boolean; user?: StoredUser; error?: string }> {
  const target = await getUserById(targetUserId);
  if (!target) return { success: false, error: "Target user not found" };

  if (adminUserId === targetUserId && !isActive) {
    return { success: false, error: "You cannot deactivate your own account." };
  }
  if (target.role === "admin" && !isActive && target.isActive && (await countActiveAdmins()) <= 1) {
    return { success: false, error: "Cannot deactivate the last active administrator." };
  }

  const row = unwrap(
    await db().from("profiles").update({ is_active: isActive }).eq("id", targetUserId).select(PROFILE_COLUMNS).single(),
    "Update status"
  );

  // A deactivated user must not keep a working session.
  if (!isActive) {
    await db().auth.admin.signOut(targetUserId).catch(() => undefined);
  }

  return { success: true, user: toUser(row as ProfileRow) };
}

/**
 * Creates a customer account. The role is always 'customer' (set by the
 * on_auth_user_created trigger); it is never taken from the request.
 *
 * Accounts are created pre-confirmed: transactional email is in sandbox mode during
 * development, so a confirmation link could not reach real customers yet.
 */
export async function registerCustomerUser(
  email: string,
  password: string,
  metadata: { fullName: string; companyName?: string; phone?: string }
): Promise<{ success: boolean; user?: StoredUser; error?: string }> {
  const normalisedEmail = email.toLowerCase().trim();

  const { data, error } = await db().auth.admin.createUser({
    email: normalisedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: metadata.fullName,
      company_name: metadata.companyName || "",
      phone: metadata.phone || "",
    },
  });

  if (error || !data.user) {
    const message = error?.message || "Registration failed.";
    if (/already (been )?registered|already exists/i.test(message)) {
      return { success: false, error: "An account with this email already exists." };
    }
    return { success: false, error: message };
  }

  const user = await getUserById(data.user.id);
  if (!user) {
    return { success: false, error: "Account created but profile is missing. Has the database migration been applied?" };
  }
  return { success: true, user };
}

/** Password rules shared by registration (server) and the signup form. */
export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}
