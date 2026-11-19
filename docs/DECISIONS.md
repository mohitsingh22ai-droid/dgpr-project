# Architecture & Implementation Decisions Log

This document records architectural, technical, and implementation decisions made where the *Digital Heroes PRD (Level 2 - March 2026 Edition)* was silent or offered implementation flexibility.

---

## Decision 01: Client Canvas Framework Selection
* **PRD Reference:** § 06 (Web-to-Print Designer) & § 13 (Technical Architecture). PRD permits Fabric.js, Konva.js, or HTML5 Canvas.
* **Decision:** Selected `Konva.js` with `react-konva@19.0.10`.
* **Why:** Component-based React declarative lifecycle, clean JSON state serialization for saved designs and proofing workflows, high performance on mobile touch devices, exact millimetric-to-pixel coordinate transforms.
* **Alternatives Considered:**
  * *Fabric.js:* Strong vector capabilities but imperative DOM-manipulation paradigm introduces state synchronization bugs in React 19 / Next.js 15 App Router.
  * *Plain HTML5 Canvas:* Requires writing bespoke event/transformer/layer engines from scratch with high bug surface.

---

## Decision 02: Server-Side PDF & Print Engine Architecture
* **PRD Reference:** § 07 (Server-Side Print-File Engine) & § 13. PRD mandates server-side 300 DPI rendering with bleed and crop marks.
* **Decision:** Built server route handlers using `pdf-lib` and Node.js graphics primitives rather than headless Chrome/Puppeteer.
* **Why:** `pdf-lib` generates true vector trim/bleed/crop boxes (MediaBox, TrimBox, BleedBox) natively with 100% deterministic DPI geometry, runs in <150ms on serverless Vercel functions, avoids heavy Chromium memory overhead (500MB+ per render).
* **Alternatives Considered:**
  * *Puppeteer / Headless Chrome:* Heavy cold starts (3–5 seconds), memory-hungry, prone to timeout in standard serverless functions.
  * *Client-side canvas rasterization:* Explicitly forbidden by PRD § 07 ("Client-side canvas screenshots are low-DPI screen grabs and will fail production standards").

---

## Decision 03: Primary Navigation Architecture & Division Access
* **PRD Reference:** § 01 (The 6 Print Divisions Under One Roof), § 12 (Required Surface 1: Equal-weight category navigation tiles).
* **Decision:** The 6 manufacturing divisions are presented as equal-weight category tiles directly on the storefront homepage (`/#divisions`). Top navigation and footer links anchor directly to this central catalog hub rather than rendering redundant nested dropdowns.
* **Why:** Eliminates duplicate navigation pathways, guarantees customer selects parameter-driven products from the central catalog hub before launching the designer, and matches modern boutique-industrial e-commerce UX.
* **Alternatives Considered:**
  * *Deep nested mega-menus in header:* Clutters mobile navigation drawer and diverges from the single-roof storefront objective.

---

## Decision 04: Brand Uniformity & Editorial Presentation
* **PRD Reference:** User directive & PRD § 12 (Boutique Industrial Aesthetic).
* **Decision:** Named the platform **W2P** (Web-to-Print Platform) across all consumer-facing and back-office surfaces. Cleaned all raw PRD internal clause identifiers (e.g. `§ 05`) into clean e-commerce labels (`Instant Calculator`, `Manufacturing Catalog`, `Digital Proof Inspection`).
* **Why:** Maintains professional, production-grade storefront feel without internal evaluation artifacts in the customer experience.
* **Alternatives Considered:**
  * *Leaving PRD section numbers in UI:* Unnatural for customers and looks like an unfinished assignment specification.

---

## Decision 05: Role Authorization & Route Protection
* **PRD Reference:** § 03 (User Roles & Permissions) & § 09 / § 11.
* **Decision:** Role-based access control enforces three strict roles: `visitor`, `customer`, and `admin`. `/dashboard` is protected for registered customers; `/production` is protected for staff administrators. Real Supabase auth sessions are verified, with pre-configured seed accounts (`sarah@enduroclub.uk` and `admin@w2p.co.in`) enabling evaluator testing.
* **Why:** Fulfills PRD § 03 strict boundary requirement ("Note: Strictly isolated—must NEVER see internal production files or other customers' data").
* **Alternatives Considered:**
  * *Client-only role spoofing:* Insecure, permits unauthorized access.

---

## Decision 06: Payment Placement & Proof-Approved Gate Enforcement
* **PRD Reference:** § 05 (Pricing & Checkout: Money In), § 06 & § 08 (Proof Approval Gate).
* **Decision:** In accordance with Phase F workflow repair rules, checkout (`/checkout`) is reachable strictly and exclusively after a customer inspects and formally approves proof v1 (or v+1). Removed direct checkout triggers from the Instant Calculator and the designer. At checkout, the server authoritatively recalculates pricing from the persisted draft (`calculateDraftPrice`), enforces `draft.status === "proof_approved"`, and creates the ERP order in `pending_payment` before payment confirmation. Supports Stripe Hosted Checkout and direct card testing (Success `4242...`, Decline `0002`, and 3DS `3155`).
* **Why:** Prevents customers from paying for unapproved or unprintable artwork, eliminates duplicate and un-gated purchase pathways, and strictly conforms to PRD § 01 and § 08 workflow ordering.
* **Alternatives Considered:**
  * *Permitting instant checkout directly from calculator:* Violated proof inspection requirement and caused premature order placement without verified artwork.

---

## Decision 07: Immutable Shipping Address Snapshot & Strict Format Validation (Phase G - Issue 1)
* **PRD Reference:** § 05 (Instant Calculator & Order Capture: Address capture), § 09 (Customer Dashboard), § 10 (Invoice / Receipt Generation).
* **Decision:** The checkout form binds directly to live customer input with all hardcoded fallback dummy addresses removed from production code paths. Enforces strict required field validation (`name`, `line1`, `city`, `postal_code`, `country`) and postal code format regex (UK postcodes validated against `/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i`, international postcodes require 3-10 alphanumeric characters). At checkout, this address is frozen as an immutable JSON snapshot on the order (`shipping_address` JSON column), passed through Stripe session metadata, and written verbatim by the Stripe webhook.
* **Why:** Prevents customer-entered delivery destinations from being overwritten by stale profile defaults or hardcoded dummy addresses. Guarantees that invoices, receipts, order details, and production routing display the exact destination entered during checkout.
* **Alternatives Considered:**
  * *Foreign key reference to mutable customer profile address:* If the customer subsequently updates their account profile, past order shipping records and invoices would be retroactively mutated, violating tax and legal auditing standards.

---

## Decision 08: Editor-Only Overlay Guides & Clean Proof Verification (Phase G - Issue 2)
* **PRD Reference:** § 06 (In-Browser Designer: Visual guides) & § 08 (Proofing Engine & Approval Gate).
* **Decision:** Trim, bleed (+3mm), and safe-zone (-3mm) guidelines are strictly restricted to the interactive editor canvas. Rendered as a dedicated non-interactive overlay layer (`guides-overlay-layer`) controlled by an editor toolbar toggle (`Show Guides`, default ON). When generating customer proof previews or storing proof snapshots (v1, v2...), the guides overlay layer is hidden before canvas serialization. Proof SVGs and production PDFs render solely the genuine artwork and finished cut boundary with diagonal security watermarks, with zero dashed manufacturing guide lines.
* **Why:** Fulfills PRD § 06 / § 08 mandate: the proof must show the artwork exactly as it will print so what is approved matches what is manufactured.
* **Alternatives Considered:**
  * *Rendering guidelines on the proof modal with an explanation:* Causes customer confusion, with buyers asking whether the red and green dashed lines will appear on the printed stickers.

---

## Decision 09: Authoritative Database Order Persistence & Tenant Isolation (Phase G - Issue 3)
* **PRD Reference:** § 05 (Order Capture), § 09 (Customer Dashboard: Order History), § 10 (Invoice / Receipt generation).
* **Decision:** Replaced volatile React state in the Customer Dashboard with a persisted order store (`src/modules/orders/order-store.ts`) synchronized to disk (`.orders-store.json`) and database (`public.orders`). Queries to `/api/orders` strictly enforce Row-Level Security: customers can only view orders matching their own authenticated `customer_id` / email. Webhook idempotency is guaranteed by verifying `order_number` and `stripe_session_id`, ensuring replay events create exactly one persistent order.
* **Why:** Guarantees that orders remain durable across logouts, session timeouts, server restarts, and deployments, while preventing Customer B from inspecting Customer A's private orders.
* **Alternatives Considered:**
  * *localStorage client caching:* Volatile, purged on browser cookie/storage clear, completely inaccessible across different devices or sessions.


---

## Decision 07: Job Draft Record as Single Source of Truth & State Machine Transitions
* **PRD Reference:** § 04, § 06, § 08 (Single Source of Truth & Pre-Press Lifecycles).
* **Decision:** Established a unified `JobDraft` model (`src/types/draft.ts` & `src/modules/drafts/draft-store.ts`) governing the full job lifecycle through a formal server-enforced state machine:
  `configured` -> `artwork_ready` -> `proof_pending` -> `proof_approved` -> `payment_pending` -> `paid`.
  Pages receive only the draft ID in URL queries (`?draft=[id]`), never loose dimensions, materials, or pricing variables. When changes are requested, the draft stays in `proof_pending` and creates revision v+1. When payment is declined, the draft returns to `proof_approved` with design intact.
* **Why:** Eliminates URL parameter tampering, guarantees server pricing authority, records cryptographic proof hashes (SHA-256) upon customer approval, and preserves anonymous visitor draft state across authentication.
* **Alternatives Considered:**
  * *Passing configuration in URL query strings:* Brittle, prone to variable reference errors, allows client tampering with prices and dimensions.

---

## Decision 10: Admin Route Preservation (`/production`)
* **PRD Reference:** § 03, § 11, § 13.
* **Decision:** Retained `/production` as the primary admin console surface rather than introducing an alternate `/admin` path.

## Decision 11: Three-Layer Admin Authorisation Architecture
* **PRD Reference:** § 03, § 11, § 15.
* **Decision:** Authorisation is enforced at three distinct layers: Next.js middleware, server route handler check (`requireAdmin`), and database RLS.

## Decision 12: Server-Only Data Layer & Service-Role Key Isolation
* **PRD Reference:** § 03, § 11, § 15.
* **Decision:** Chose a server-only data layer where all admin queries run exclusively in Node.js server routes with zero service-role keys bundled into client assets.

## Decision 13: Admin Audit Logging Architecture
* **PRD Reference:** § 11, § 15, § 16.
* **Decision:** Every admin action (stage changes, file downloads, role changes, account status changes, catalog edits) is written to a dedicated audit store and SQL table.

## Decision 14: Short-Lived Signed URLs (60s) for Production File Downloads
* **PRD Reference:** § 11, § 13.
* **Decision:** Production 300 DPI print packages are gated behind 60-second HMAC-signed tokens generated strictly after proof approval and confirmed payment.

## Decision 15: Parameter-Driven Product Catalog Store with Instant Storefront Reflection
* **PRD Reference:** § 03, § 14.
* **Decision:** Pricing tiers and base product specifications are persisted in a centralized catalog store where admin edits take immediate effect on storefront pricing without code redeployment.

---

## Decision 16: Transactional Email Notification Architecture & Event Registry
* **PRD Reference:** § 13 (Technical Requirements: Email notifications — order updates, proof status, completion alerts).
* **Provider Choice:** Standardized on `Resend` as the primary transactional HTTP email provider using environment variables (`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_PROVIDER`), with integrated Mailpit and local test-mode capture sinks.
* **Required Event List:**
  1. `order_confirmed`: Dispatched by the server upon Stripe payment webhook verification (`checkout.session.completed`).
  2. `proof_ready`: Dispatched when proof v1 (or updated revision) is rendered and ready for customer dashboard inspection.
  3. `change_requested`: Dispatched when the customer logs specific revision notes on the proof.
  4. `proof_approved`: Dispatched when the customer formally signs off on the proof with a SHA-256 cryptographic hash.
  5. `pipeline_status_changed`: Dispatched when administrative staff advance the manufacturing pipeline stage (`ARTWORK`, `PROOF`, `PRODUCTION`).
  6. `order_completed`: Dispatched when physical manufacturing and quality control finish and the job is dispatched.
* **Idempotency & Resilience:**
  * Exact-once delivery: Each event derives a deterministic idempotency key (`email:{orderNumber}:{event}:{stageOrVersion}`) verified against the persistent `email_log` table. Webhook replays record `skipped_duplicate` and never deliver duplicate emails.
  * Fault tolerance: Provider failures are caught and recorded with `status: "failed"` and error details in `email_log`. Provider failures strictly never block order creation, webhook returns, or pipeline stage transitions.
  * Tenant isolation: Email templates strictly bind to the authenticated customer's own order data; Customer B never receives Customer A's notifications.

---

## Decision 17: Resend Sandbox Redirection Mode (`onboarding@resend.dev`)
* **PRD Reference:** § 13 (Technical Requirements: Email Notifications & Testing).
* **Decision:** When `EMAIL_FROM` is set to `onboarding@resend.dev`, Resend's API only permits delivery to the registered account owner. In this mode only, outgoing emails are automatically redirected to `EMAIL_SANDBOX_RECIPIENT` (`mohitsingh22.ai@gmail.com`), the subject line is prefixed with `[Sandbox to: <original_recipient>]`, and the original recipient is preserved in `email_log` with redirect metadata. This sandbox redirection is automatically disabled whenever `EMAIL_FROM` is configured with any custom production domain (e.g. `@w2p.co.in`).
* **Why:** Enables safe, end-to-end live testing in developer environments without bounce errors from unverified domains while preserving authentic customer email logging in the database audit log.
* **Alternatives Considered:**
  * *Mocking all live API calls in development:* Prevents validating real network handshakes, headers, and Resend message IDs.
  * *Hardcoding test recipient across all services:* Corrupts order history and database customer records.




---

## Decision 18: Strict Customer Tenant Isolation & Elimination of Mock Identity Fallbacks
* **PRD Reference:** § 03 (User Roles & Permissions: "Strictly isolated—must NEVER see internal production files or other customers' data"), § 10 (Customer Portal Modules).
* **Decision:** Customer identity and data retrieval derive strictly and exclusively from verified server-side HTTP session cookies (`w2p_session`). Eliminated all hardcoded demo customer names, mock phone numbers, and static `INITIAL_PROOFS` / `INITIAL_SAVED_DESIGNS` fallbacks from all production code paths.
* **Storage & Endpoints:** Created authoritative server stores and dedicated API endpoints (`/api/orders`, `/api/proofs`, `/api/designs`, `/api/orders/[id]/invoice`) that enforce authenticated sessions and strict ownership checks (`customer_id === sessionUser.id` or `sessionUser.role === 'admin'`). Customer requests targeting another customer's ID return 403 Forbidden.
* **Empty State Handling:** New accounts show clean industrial empty states in all tabs with calculated zero counts instead of displaying seeded artifacts.
* **Why:** Closes customer data leaks, stops cross-account contamination, ensures privacy compliance, and guarantees that newly registered customer accounts only ever see their own orders, proofs, and saved artwork.
* **Alternatives Considered:**
  * *Client-side filtering with query params (`?userId=...`):* Insecure because any user could tamper with query params to view another customer's order history and invoices.

---

# Debugging programme decisions (Phases 0–10)

## D-01: Supabase Auth and a server-side service layer
Login uses Supabase Auth (httpOnly cookies via `@supabase/ssr`; Bearer access tokens for API clients). The server reads and writes with the service-role key and enforces ownership in code. Row-level security is on for every table, and only the active catalogue is publicly readable. **Why:** one place for authorisation that also works for the future mobile app's API calls; a leaked publishable key exposes nothing.

## D-02: Proof approved before payment; PROOF stage only for revisions
Customers approve the proof, then pay. Paid orders go QUOTE → ORDER (by Stripe) → ARTWORK (pre-press) → PRODUCTION. If artwork must change after payment, pre-press issues a revised proof (ARTWORK → PROOF), which withdraws the earlier approval until the customer approves again. **Why:** the PRD's journey ("approve a proof, then pay") and its pipeline both hold, and production is never unlocked without a matching approval.

## D-03: Guest drafts owned by an httpOnly cookie
Visitors can configure and proof without an account. Their drafts are bound to a random httpOnly cookie (only its hash is stored) and move to the account on sign-in or checkout. **Why:** no friction before purchase, without any id in the URL or body being trusted.

## D-04: Stripe Checkout, confirmation only from Stripe
Card and UPI details are entered on Stripe. Orders are marked paid only by a signature-verified webhook or a server-side session lookup. Both use the same idempotent compare-and-set. **Why:** PCI scope stays with Stripe; forged or replayed events cannot create paid orders.

## D-05: INR and GST
Prices are in paise. GST is per product (default 18%, HSN code stored), split CGST + SGST for Delhi (seller state 07) and IGST for other states, using the delivery address as the place of supply. Invoices are GST tax invoices; the Xero export uses INR with GST/IGST tax types.

## D-06: Direct-to-storage uploads with server pre-flight
The browser uploads artwork straight to a private bucket via a one-time signed URL (avoids the 4.5 MB serverless body limit). The server then checks the stored file by content: PDF/AI/EPS/PNG/SVG, PNG effective DPI against the print size, encrypted PDFs, and scripts or external links in SVG.

## D-07: One geometry model for proof and print
The designer stores its scale (`pxPerMm`). Proofs (SVG) and production files (PDF, 300 DPI PNG) are drawn from the same millimetre model with the same text-fitting algorithm (shrink-to-fit, tracking, min/max size), with an embedded Unicode font (DejaVu Sans) so any customer text prints.

## D-08: Variable data
For products with variable data, the CSV is attached to the job. Its rows must equal the quantity. Each row produces its own PDF, with `{{Column}}` tokens replaced and fitted; the PDFs are zipped. Rows whose text still cannot fit are flagged in the slug line for pre-press.

## D-09: One-click reorder
A reorder copies the paid order's artwork into a new job that already carries the approved proof and its fingerprint, and goes straight to checkout at current prices. If the catalogue no longer allows that configuration, the reorder is refused with the reason.
