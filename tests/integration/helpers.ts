/**
 * Shared setup for integration tests that run against the Supabase project.
 *
 *   npm run test:integration
 *
 * Every test account uses the reserved domain @e2e.w2p.test so the seed script
 * and `cleanupAccounts` can remove it; no other data is touched.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
process.env.EMAIL_PROVIDER = "test";
process.env.W2P_DATA_DIR = process.env.W2P_DATA_DIR || ".data-test";

import crypto from "crypto";
import { db } from "@/lib/supabase/server";

export const hasDatabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export interface TestAccount {
  id: string;
  email: string;
}

const created: string[] = [];

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@e2e.w2p.test`;
}

export async function createTestCustomer(label = "it"): Promise<TestAccount> {
  const email = uniqueEmail(label);
  const { data, error } = await db().auth.admin.createUser({
    email,
    password: `Pw-${crypto.randomBytes(8).toString("hex")}1`,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error || !data.user) throw new Error(`createTestCustomer: ${error?.message}`);
  created.push(data.user.id);
  return { id: data.user.id, email };
}

export async function createTestAdmin(label = "admin"): Promise<TestAccount> {
  const account = await createTestCustomer(label);
  const { error } = await db().from("profiles").update({ role: "admin" }).eq("id", account.id);
  if (error) throw new Error(`createTestAdmin: ${error.message}`);
  return account;
}

/** Deletes every account created by this test file together with its data. */
export async function cleanupAccounts(): Promise<void> {
  if (created.length === 0) return;
  const ids = created.splice(0);
  await db().from("drafts").update({ order_id: null }).in("customer_id", ids);
  await db().from("orders").delete().in("customer_id", ids);
  await db().from("drafts").delete().in("customer_id", ids);
  await db().from("saved_designs").delete().in("customer_id", ids);
  await db().from("admin_audit_logs").delete().in("admin_id", ids);
  for (const id of ids) {
    await db().auth.admin.deleteUser(id);
  }
}

export const SHIPPING = {
  name: "Test Customer",
  line1: "14 Okhla Industrial Estate",
  city: "New Delhi",
  postal_code: "110020",
  country: "India",
};
