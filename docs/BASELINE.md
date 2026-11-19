# Test status — Debugging & Testing Programme

## Final status (after Phases 1–10 and the UI redesign)

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | ✅ clean |
| `npm test` (unit) | ✅ 57 / 57 |
| `npm run test:integration` (against Supabase) | ✅ 29 / 29 |
| `next build` | ✅ compiles |
| Playwright desktop + tablet + mobile | ✅ 170 passed, 34 skipped (API-only specs run on desktop only), 0 failed |

All twelve audit defects A1–A10 are covered by `e2e/security-regressions.spec.ts` and pass.
The money path (approval gate → Stripe Checkout → signed webhook → GST → revised proof → production files)
is covered by `e2e/checkout-proofs-production.spec.ts`.

Bugs found by the test phase and fixed: role-based login redirect, Stripe client behind proxies,
design save racing client auth state, production bucket size limit, sign-in rate-limit message,
admin payment filter value, mobile overflow (page containers in the flex `<main>`), small-screen
navigation and dashboard tabs.

Run locally: `npm run seed`, then `npm run test:e2e:all` (needs `.env.local`; behind a proxy set
`NODE_USE_ENV_PROXY=1`). Test sign-ins are cached per run because Supabase rate-limits password sign-ins.

---

# Phase 0 Baseline (historical)

Snapshot of the codebase **before any functional fix**, taken on branch `fix/phase-0-baseline`.
Every later phase must keep this list shrinking and must never turn a passing test red.

## How to run

```bash
npm run check          # typecheck + lint + unit tests
npm run test:e2e       # Playwright, desktop project (reseeds .data-e2e and starts its own dev server)
npm run test:e2e:all   # desktop + tablet (Galaxy Tab S4) + mobile (Pixel 7)
```

In environments with a preinstalled Chromium, set `PW_CHROMIUM_EXECUTABLE=/path/to/chromium`.

## Static checks

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors (was not runnable before Phase 0; 125 errors fixed) |
| `npm test` (unit) | ✅ 93 / 93 — **but none of the critical defects below are caught by them** |

## End-to-end (desktop project, 86 tests)

**49 passed · 37 failed** after the Phase 0 harness fixes.

### Security regression suite (`e2e/security-regressions.spec.ts`) — 12 failing by design

Each test asserts the correct behaviour for an audit defect and stays red until its phase lands.

| Test | Defect | Owning phase |
|---|---|---|
| A1 shared "master" passwords | Any account opens with `password` / `admin123` / `customer123` | 1 |
| A2 plaintext password storage | Passwords stored verbatim | 1 |
| A3 anonymous / customer paid-order creation (×2) | `POST /api/orders` creates paid orders for anyone | 2 |
| A4 draft PATCH bypass | Status / quantity / owner writable; approval gate skippable | 4 |
| A5 simulated card payment | Raw card numbers accepted; orders marked paid without Stripe | 6 |
| A6 unsigned webhook | Forged `checkout.session.completed` creates paid orders | 6 |
| A7 cross-customer leak | Ownerless orders fall back to Customer A's id | 2 |
| A8 anonymous proof approval / draft takeover (×2) | Identity taken from request body | 2 |
| A9 admin console served to customers | Middleware checks cookie presence, not role | 2 |
| A10 unauthenticated print engine / Unicode crash (×2) | Public render + merge endpoints; `₹` crashes pdf-lib | 2 / 7 |

### Pre-existing failures — 25

| Spec | Failure | Classification | Owning phase |
|---|---|---|---|
| phase-g-3-issues 1A, 1B | Order flow returns 401 at a step the test expects 200 | Stale flow vs. auth changes in app | 6 |
| phase-h-admin 2 | Stage filter still shows `W2P-2026-00201` | App bug: admin filter | 9 |
| phase-h-admin 3 | Download gate step returns 401 | Stale flow / auth | 9 |
| phase-h-admin 8 | Customer call to an admin endpoint returns **200** (expected 403) | **App bug: authorisation** | 2 |
| phase-h-admin 10 | Horizontal overflow at 375 px | **App bug: responsive layout** | 10 |
| phase-i 1 | `header` shows the user's name twice (strict-mode locator) | Test locator too loose | 1 |
| phase-i 2, 3, 4 | Sign-in of a newly registered user never reaches `/dashboard` | App/test: post-signup redirect | 1 |
| w10 customer → `/production` | "AUTHORIZATION FORBIDDEN" page never shown | **App bug: A9** | 2 |
| w12 design tokens | CTA "Select Division & Customise" no longer exists | Stale UI copy in test | 10 |
| w5 approval gate, request changes | Proof endpoints return 404 for the test's ids | Two disconnected proof systems | 5 |
| w6 price tampering | Checkout returns 400 (stricter address validation) | Stale request payload | 6 |
| w6 / phase-f decline card, 3DS | Expects simulated test-card behaviour | Replaced by real Stripe test mode | 6 |
| w8 one-click reorder | Success message never appears | **App bug: B18** reorder ignores the order | 8 |
| w8 invoice download | 401 for the invoice request | Stale auth in test | 8 |
| w9 console, table view (×3) | "Factory Console" / "Dense Job Table" UI not found | Stale UI copy in test | 9 |
| phase-f happy path | Never reaches `/dashboard` after payment | Payment flow | 6 |
| phase-f gate checks (×2) | Gate error code / message differs from test | Stale contract | 4 / 6 |

Tablet and mobile projects will be baselined in Phase 10 (responsive hardening).
