import { Page, expect } from "@playwright/test";

export const TEST_USERS = {
  customerA: {
    email: "sarah@enduroclub.uk",
    password: "customer123",
    name: "Sarah Jenkins",
    role: "customer",
    company: "Grizedale Enduro Racing",
  },
  customerB: {
    email: "customerb@example.com",
    password: "customer123",
    name: "Customer B",
    role: "customer",
    company: "Apex Biking Co",
  },
  admin: {
    email: "admin@w2p.co.in",
    password: "admin123",
    name: "Marcus Vance",
    role: "admin",
    company: "W2P Ltd",
  },
};

/**
 * Performs real UI login through the login page (/login)
 */
/**
 * Signs in through the real login form. The resulting session cookies are cached
 * per user for the rest of the run and reused on later calls, because Supabase Auth
 * rate-limits password sign-ins per IP (about 30 per 5 minutes). Pass
 * `{ fresh: true }` to always exercise the form.
 */
const sessionCache = new Map<string, { cookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>; at: number }>();

export async function loginViaUi(
  page: Page,
  credentials: { email: string; password: string },
  expectedDestination?: string,
  options: { fresh?: boolean } = {}
) {
  const cached = sessionCache.get(credentials.email);
  if (cached && !options.fresh && Date.now() - cached.at < 30 * 60_000) {
    await page.context().addCookies(cached.cookies);
    await page.goto(expectedDestination || "/dashboard");
    await page.waitForLoadState("domcontentloaded");
    return;
  }

  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');

  if (expectedDestination) {
    // Sign-in round-trips to Supabase Auth; allow for network latency.
    await page.waitForURL(`**${expectedDestination}`, { timeout: 30000 });
  }
  const cookies = (await page.context().cookies()).filter((c) => c.name.startsWith("sb-"));
  if (cookies.length) sessionCache.set(credentials.email, { cookies, at: Date.now() });
}

/**
 * Performs UI logout
 */
export async function logoutViaUi(page: Page) {
  // Signing out revokes the user's sessions, so cached sessions are no longer valid.
  sessionCache.clear();
  // On small screens Sign Out lives in the menu drawer.
  const menuToggle = page.getByRole("button", { name: "Toggle menu" });
  if (await menuToggle.isVisible()) await menuToggle.click();
  const signOutButton = page.locator('button:has-text("Sign Out"):visible').first();
  if (await signOutButton.isVisible()) {
    await signOutButton.click();
    // Logout may land on /login?redirect=..., so match the path with or without a query string.
    await page.waitForURL(/\/login(\?|$)/, { timeout: 10000 });
  }
}

/**
 * Signs in through the API and returns the Supabase access token for
 * `Authorization: Bearer` requests.
 */
export async function apiToken(
  request: import("@playwright/test").APIRequestContext,
  credentials: { email: string; password: string }
): Promise<string> {
  const res = await request.post("/api/auth/login", { data: credentials });
  if (res.status() !== 200) {
    throw new Error(`API login failed for ${credentials.email}: HTTP ${res.status()}`);
  }
  return (await res.json()).token as string;
}

/**
 * Creates a job draft through the API from the page's browser context, so the
 * draft is owned by that browser (guest cookie) or its signed-in account.
 */
export async function createDraftInBrowser(
  page: Page,
  draft: { productId: string; widthMm: number; heightMm: number; materialId: string; quantity: number }
): Promise<{ id: string; productSlug: string }> {
  if (page.url() === "about:blank") {
    await page.goto("/");
  }
  const res = await page.request.post("/api/drafts", { data: draft });
  if (res.status() !== 201) {
    throw new Error(`Draft creation failed: HTTP ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).draft;
}
