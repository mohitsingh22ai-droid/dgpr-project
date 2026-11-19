import { describe, it, after } from "node:test";
import assert from "node:assert";
import { hasDatabase, createTestCustomer, createTestAdmin, cleanupAccounts, uniqueEmail } from "./helpers";
import {
  registerCustomerUser,
  getUserById,
  updateUserRole,
  updateUserStatus,
  validatePasswordStrength,
} from "@/modules/auth/users-store";
import { db } from "@/lib/supabase/server";

describe("Accounts & roles (PRD § 03, § 09)", { skip: !hasDatabase }, () => {
  after(cleanupAccounts);

  it("public registration always creates an active customer profile", async () => {
    const email = uniqueEmail("register");
    const result = await registerCustomerUser(email, "Strong-pass-1", { fullName: "New Person", phone: "" });
    assert.strictEqual(result.success, true, result.error);
    const user = result.user!;
    try {
      assert.strictEqual(user.role, "customer");
      assert.strictEqual(user.isActive, true);
      assert.strictEqual(user.full_name, "New Person");
      assert.strictEqual(user.phone, null, "an omitted phone is stored as null, never a demo value");

      const duplicate = await registerCustomerUser(email, "Strong-pass-1", { fullName: "Again" });
      assert.strictEqual(duplicate.success, false);
      assert.match(duplicate.error ?? "", /already exists/);
    } finally {
      await db().auth.admin.deleteUser(user.id);
    }
  });

  it("passwords are verified by Supabase Auth, never stored by the app", async () => {
    const { data } = await db().from("profiles").select("*").limit(1);
    const columns = Object.keys(data?.[0] ?? {});
    assert.ok(!columns.some((c) => /pass/i.test(c)), `profiles must not hold password data (columns: ${columns})`);
  });

  it("enforces the password strength rule", () => {
    assert.ok(validatePasswordStrength("short1"));
    assert.ok(validatePasswordStrength("lettersonly"));
    assert.strictEqual(validatePasswordStrength("letters-and-1"), null);
  });

  it("an admin cannot demote or deactivate themselves", async () => {
    const admin = await createTestAdmin("self");
    const demote = await updateUserRole(admin.id, admin.id, "customer");
    assert.strictEqual(demote.success, false);
    assert.match(demote.error ?? "", /own admin account/);

    const deactivate = await updateUserStatus(admin.id, admin.id, false);
    assert.strictEqual(deactivate.success, false);
    assert.match(deactivate.error ?? "", /own account/);
  });

  it("an admin can promote, deactivate and reactivate another account", async () => {
    const admin = await createTestAdmin("actor");
    const customer = await createTestCustomer("target");

    assert.strictEqual((await updateUserRole(admin.id, customer.id, "admin")).user?.role, "admin");
    assert.strictEqual((await updateUserRole(admin.id, customer.id, "customer")).user?.role, "customer");

    assert.strictEqual((await updateUserStatus(admin.id, customer.id, false)).user?.isActive, false);
    assert.strictEqual((await getUserById(customer.id))?.isActive, false);
    assert.strictEqual((await updateUserStatus(admin.id, customer.id, true)).user?.isActive, true);
  });
});
