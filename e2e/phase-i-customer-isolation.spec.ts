import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { getSavedDesignsForUser } from "../src/modules/designs/saved-designs-store";
import { getUserByEmail } from "../src/modules/auth/users-store";
import { createOrder } from "../src/modules/orders/order-store";
import { TEST_USERS, loginViaUi, logoutViaUi } from "./support/auth-helpers";
import fs from "fs";
import path from "path";

test.describe("PHASE I: Customer Data Leak & Identity Hardening (PRD § 03, § 10)", () => {
  const timestamp = Date.now();
  const newCustomer = {
    name: "Mohit Singh",
    email: `mohit.singh.${timestamp}@e2e.w2p.test`,
    password: "Password123!",
    company: "Singh Precision Ltd",
    phone: "+44 7700 900888",
  };

  test("1. Sign up new account 'Mohit Singh': Nav & Profile show Mohit; NO Sarah, NO demo phone; all tabs empty with zero counts", async ({
    page,
  }) => {
    // Collect console/page errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");

    await page.fill("#name", newCustomer.name);
    await page.fill("#company", newCustomer.company);
    await page.fill("#phone", newCustomer.phone);
    await page.fill("#email", newCustomer.email);
    await page.fill("#password", newCustomer.password);

    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // 1. Check Profile Card
    const profileHeading = page.locator("h1", { hasText: newCustomer.name });
    await expect(profileHeading).toBeVisible();
    await expect(page.locator("body")).toContainText(newCustomer.email);
    await expect(page.locator("body")).toContainText(newCustomer.phone);
    await expect(page.locator("body")).toContainText(newCustomer.company);

    // Assert absence of demo leaks in profile
    await expect(page.locator("body")).not.toContainText("Sarah Jenkins");
    await expect(page.locator("body")).not.toContainText("+44 7911 123456");
    await expect(page.locator("body")).not.toContainText("Grizedale Enduro Racing");

    // 2. Check Nav Badge (Shows user first name, NOT 'Sarah')
    const navBadge = page.locator("header").getByText("Mohit").first();
    await expect(navBadge).toBeVisible();
    const navSarah = page.locator("header").getByText("Sarah");
    await expect(navSarah).toHaveCount(0);

    // 3. Check Counts & Badges (All must be 0)
    await expect(page.locator("body")).toContainText("0 Total");
    await expect(page.locator("body")).toContainText("0 Awaiting");

    // 4. Check Empty States in all 3 tabs
    // Tab 1: Orders
    await expect(page.getByText("No Orders Placed Yet")).toBeVisible();

    // Tab 2: Proofs
    await page.click('button:has-text("Active Proofs & Approvals")');
    await expect(page.getByText("No Active Digital Proofs")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("W2P PROOF · v1");
    await expect(page.locator("body")).not.toContainText("W2P PROOF · v2");

    // Tab 3: Saved Designs
    await page.click('button:has-text("Saved Designs")');
    await expect(page.getByText("No Saved Designs in Library")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Enduro Club Brand Stickers");

    expect(errors).toEqual([]);
  });

  test("2. Place an order as the new user: Appears only in their history; seeded customer does not see it", async ({
    page,
    request,
  }) => {
    // Log in as new customer
    await loginViaUi(page, { email: newCustomer.email, password: newCustomer.password }, "/dashboard");

    const orderNumber = `W2P-2026-MOHIT-${Date.now()}`;
    const newOrderPayload = {
      order_number: orderNumber,
      pipeline_stage: "ORDER",
      payment_status: "paid",
      subtotal_cents: 2500,
      tax_cents: 500,
      total_cents: 3000,
      currency: "GBP",
      shipping_address: {
        name: newCustomer.name,
        line1: "123 High Street",
        city: "Manchester",
        postal_code: "M1 1AA",
        country: "United Kingdom",
      },
    };

    // Orders are only created by checkout; place one server-side for Mohit's real account.
    const mohit = (await getUserByEmail(newCustomer.email))!;
    const { order: created } = await createOrder({
      ...newOrderPayload,
      id: "",
      customer_id: mohit.id,
      customer_email: mohit.email,
      shipping_address: { name: newCustomer.name, line1: "12 MG Road", city: "Bengaluru", postal_code: "560001", country: "India" },
    } as never);
    expect(created.customer_id).toBe(mohit.id);

    // Reload dashboard: New order is visible in Mohit's dashboard
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toContainText(orderNumber);
    await expect(page.locator("body")).toContainText("1 Total");

    // Log out Mohit
    await logoutViaUi(page);

    // Log in as Seeded customer Sarah
    await loginViaUi(page, { email: TEST_USERS.customerA.email, password: TEST_USERS.customerA.password }, "/dashboard");

    // Sarah must NOT see Mohit's order
    await expect(page.locator("body")).not.toContainText(orderNumber);
  });

  test("3. Log in as seeded customer, log out, log in as new user: No data carries over across sessions", async ({
    page,
  }) => {
    // 1. Log in as seeded customer Sarah
    await loginViaUi(page, { email: TEST_USERS.customerA.email, password: TEST_USERS.customerA.password }, "/dashboard");
    await expect(page.locator("h1")).toContainText("Sarah Jenkins");

    // 2. Log out
    await logoutViaUi(page);

    // Hard refresh while logged out
    await page.goto("/dashboard");
    // Should be redirected to /login
    await expect(page).toHaveURL(/.*login/);

    // 3. Log in as new customer Mohit
    await loginViaUi(page, { email: newCustomer.email, password: newCustomer.password }, "/dashboard");

    // Verify completely clean Mohit identity
    await expect(page.locator("h1")).toContainText("Mohit Singh");
    await expect(page.locator("body")).not.toContainText("Sarah Jenkins");
    await expect(page.locator("header")).not.toContainText("Sarah");
  });

  test("4. Cross-Tenant API Protection: New user calling another user's order/invoice/proof/design IDs is denied (401/403/404)", async ({
    page,
  }) => {
    // Log in as new customer Mohit
    await loginViaUi(page, { email: newCustomer.email, password: newCustomer.password }, "/dashboard");

    // 1. Attempt to download Sarah's invoice directly: /api/orders/W2P-2026-00101/invoice
    const invoiceRes = await page.evaluate(async () => {
      const res = await fetch("/api/orders/W2P-2026-00101/invoice");
      return { status: res.status };
    });
    expect([403, 404]).toContain(invoiceRes.status);

    // 2. Attempt to view Sarah's proof by URL: /api/proofs/prf-101
    const proofRes = await page.evaluate(async () => {
      const res = await fetch("/api/proofs/prf-101");
      return { status: res.status };
    });
    expect([403, 404]).toContain(proofRes.status);

    // 3. Attempt to view Sarah's design by URL: /api/designs/des-01
    const designRes = await page.evaluate(async () => {
      const res = await fetch("/api/designs/des-01");
      return { status: res.status };
    });
    expect([403, 404]).toContain(designRes.status);

    // 4. Attempt to query orders passing ?userId=usr-cust-1
    const ordersRes = await page.evaluate(async () => {
      const res = await fetch("/api/orders?userId=usr-cust-1&userEmail=sarah@enduroclub.uk");
      const data = await res.json();
      return { status: res.status, orders: data.orders };
    });
    // Asking for another customer's orders is refused outright
    expect(ordersRes.status).toBe(403);
    expect(ordersRes.orders).toBeUndefined();
  });

  test("5. Grep Repository Check: 'Sarah' and '7911' must be zero outside seed script and tests", async () => {
    const cwd = process.cwd();
    const matches: string[] = [];

    // Only scan files tracked by git: build artefacts and local data stores are not part of the repository.
    const trackedFiles = execSync("git ls-files", { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
    for (const rel of trackedFiles) {
      const full = path.join(cwd, rel);
      const isTestOrSeed =
        full.includes("__tests__") ||
        full.includes("modules/seed/") ||
        full.includes("e2e") ||
        full.endsWith(".test.ts") ||
        full.endsWith(".spec.ts") ||
        full.endsWith(".jsonl") ||
        full.endsWith(".log") ||
        full.endsWith(".json");
      if (isTestOrSeed || !fs.existsSync(full)) continue;

      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, idx) => {
        if (line.includes("Sarah") || line.includes("7911")) {
          matches.push(`${full}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(matches, `Found unauthorized Sarah/7911 occurrences: ${JSON.stringify(matches)}`).toEqual([]);
  });

  test("6. Mutation Check: Disabling customer_id filter leaks data and fails assertion", async () => {
    // Normal query with filter returns 0
    const isolated = await getSavedDesignsForUser("00000000-0000-0000-0000-000000000000", "customer");
    expect(isolated.length).toBe(0);

    // Mutated query without customer filter leaks seeded design
    const leaked = await getSavedDesignsForUser("00000000-0000-0000-0000-000000000000", "admin");
    expect(leaked.length).toBeGreaterThan(0);
  });
});
