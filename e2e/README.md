# W2P End-to-End Test Suite (Phase T)

Comprehensive automated test suite powered by **Playwright with TypeScript**, covering all 12 core workflows defined in the *Digital Heroes PRD (Level 2 - March 2026 Edition)*.

---

## 1. Directory Structure

```text
e2e/
├── fixtures/                          # Binary & CSV mock datasets
│   ├── valid-race-bibs.csv            # 3-row valid race bib CSV
│   ├── single-row.csv                 # 1-row CSV
│   ├── many-rows.csv                  # 10-row batch CSV
│   ├── empty-rows.csv                 # CSV with blank lines
│   ├── special-chars.csv              # UTF-8 special characters & quotes
│   ├── long-names.csv                 # Super-long athlete names (shrink-to-fit)
│   ├── valid-logo.png                 # 1x1 test image
│   ├── valid-artwork.svg              # Clean vector artwork
│   └── valid-vector.pdf               # Valid test PDF
├── support/
│   ├── auth-helpers.ts                # Real UI sign-in/out helpers & credentials
│   ├── pdf-helpers.ts                 # Real PDF geometry inspector (pdf-lib)
│   └── test-db.ts                     # Database seed state & reset logic
├── w1-visitor-journey.spec.ts         # PRD §03, §04, §12
├── w2-signup-and-login.spec.ts        # PRD §09, §15, §16
├── w3-configurator-and-pricing.spec.ts# PRD §04, §05
├── w4-designer.spec.ts                # PRD §06
├── w5-proofs-and-approval-gate.spec.ts# PRD §08
├── w6-checkout-and-payment.spec.ts    # PRD §05
├── w7-print-file-and-csv-engine.spec.ts# PRD §07
├── w8-customer-dashboard-and-reorder.spec.ts # PRD §09, §10
├── w9-admin-console.spec.ts           # PRD §03, §11
├── w10-security-and-authorisation.spec.ts # PRD §03, §10, §13
├── w11-responsive-and-error-handling.spec.ts # PRD §13, §16
└── w12-design-consistency.spec.ts     # PRD §12 (Axe-core accessibility & tokens)
```

---

## 2. Running the Test Suite

Make sure the local server is running (`npm run dev` on port 3000), or allow Playwright's `webServer` to launch it automatically.

```bash
# Run all E2E tests (Desktop project)
npm run test:e2e

# Run only mobile viewport tests (375x812)
npm run test:e2e:mobile

# Run in headed mode (interactive browser)
npm run test:e2e:headed

# Open the HTML test report
npm run test:e2e:report
```

---

## 3. Ground Rules & Integrity
* **No fake passes:** All assertions inspect real database models, HTTP response codes, actual PDF geometry via `pdf-lib`, or visible DOM states.
* **No hardcoded secrets:** Secrets are kept in `.env.test` (gitignored), committed template in `.env.test.example`.
* **Zero external mocks:** Tests invoke the real application routes, pricing math, and server-side PDF generator.
