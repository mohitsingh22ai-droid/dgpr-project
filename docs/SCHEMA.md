# Database schema (Supabase / PostgreSQL)

Source of truth: `supabase/migrations/` (apply in filename order in the Supabase SQL editor).

| Migration | Purpose |
|---|---|
| `20261120000000_init_schema.sql` | Tables, enums, triggers, order-number sequence, RLS |
| `20261120000100_api_grants.sql` | Grants for the Data API roles (newer projects do not grant automatically) |

## Access model

- The Next.js server uses the **secret (service-role) key** and enforces ownership and roles in code (`src/lib/server-auth.ts`, `src/lib/draft-access.ts`). Identity always comes from the verified Supabase session.
- **Row-level security is enabled on every table.** The only policies for `anon` / `authenticated` are: read active divisions and products, and read your own profile. A leaked publishable key exposes nothing else.
- Files live in **private storage buckets** and are served through short-lived signed URLs:
  - `artwork`: customer uploads and CSVs, path `drafts/<draftId>/…`
  - `proofs`: rendered proof SVGs, path `drafts/<draftId>/v<n>-<hash>.svg`
  - `production`: print files, path `orders/<OrderNumber>/<OrderNumber>_<Type>_<YYYYMMDD>_<Label>.<ext>`

Money is stored in **integer paise** (INR minor units). GST is stored split: CGST + SGST for the seller's state (Delhi, `07`), IGST otherwise.

## Tables

### profiles (1:1 with `auth.users`)
`id` (= auth user id), `email`, `full_name`, `company_name`, `phone`, `gstin`, `state_code`, `role` (`customer`|`admin`), `is_active`, timestamps.
A trigger creates a **customer** profile for every new auth user. Roles are never taken from sign-up metadata; admins are promoted explicitly.

### divisions
`id` (text, e.g. `div-1`), `slug` (unique), `name`, `tagline`, `description`, `icon`, `accent_color`, `banner_image`, `is_active`, `order_index`.

### products: parameter-driven, one row models every size and material
`id` (text, e.g. `prod-vinyl-sticker`), `division_id`, `slug`, `name`, `subtitle`, `description`,
`base_price_paise`, `price_per_sq_cm_paise`, `gst_rate` (0–28), `hsn_code`,
`min/max/default_width_mm`, `min/max/default_height_mm`, `default_bleed_mm`, `default_safety_margin_mm`,
`allowed_materials` (jsonb: `{id, name, description, multiplier, badge?}[]`), `allowed_orientations` (jsonb),
`pricing_tiers` (jsonb: `{min_quantity, discount_percentage}[]`), `has_variable_data`, `variable_data_sample_headers`, `image_url`, `is_active`.

Price per unit = round((base + area_cm² × per_cm²) × material multiplier) × (1 − tier%). GST is applied on the subtotal.

### drafts: a configured job on its way to an order
`id` (uuid), `product_id`, `customer_id` (null for visitors), `customer_email`, `guest_token_hash` (SHA-256 of the visitor's httpOnly cookie; never returned by the API),
`status` (`configured` → `artwork_ready` → `proof_pending` → `proof_approved` → `payment_pending` → `paid`),
`options` (jsonb: `widthMm, heightMm, materialId, orientation, bleedMm, safetyMarginMm`), `quantity`,
`design_json` (designer canvas incl. `pxPerMm`, or upload metadata), `uploaded_file_path`, `csv_file_path`, `proof_version`, `order_id`.

### draft_proofs: versioned proofs and the approval log
`draft_id`, `version` (unique per draft), `status` (`pending_review`|`approved`|`changes_requested`|`superseded`),
`rendered_url` (`storage:proofs/…`), `sha256` (fingerprint of rendered proof + configuration + uploaded file), `feedback`, `approved_by`, `approved_by_email`, `approved_at`.

### draft_events: audit trail of every draft change
`draft_id`, `actor_id`, `actor_email`, `from_status`, `to_status`, `action`, `details` (jsonb), `created_at`.

### orders
`order_number` (unique, `W2P-<year>-<000000>` from a sequence), `customer_id` (required), `customer_email`, `customer_name`, `customer_gstin`, `draft_id`, `division_slug`,
`pipeline_stage` (`QUOTE`|`ORDER`|`ARTWORK`|`PROOF`|`PRODUCTION`|`COMPLETED`), `payment_status` (`pending`|`paid`|`failed`|`cancelled`|`refunded`),
`currency` (`INR`), `subtotal_paise`, `cgst_paise`, `sgst_paise`, `igst_paise`, `tax_paise`, `total_paise` (checks: tax = sum of parts, total = subtotal + tax),
`place_of_supply` (GST state code), `shipping_address` (jsonb snapshot: name, line1, line2, city, state, state_code, postal_code, country, phone),
`approved_proof_version`, `approved_proof_sha256`, `stripe_session_id` (unique), `stripe_payment_intent_id`, `xero_invoice` (jsonb), `notes`, `archived_at`.

**Ready for production** = `payment_status = 'paid'` AND `approved_proof_version` set.

### order_items
`order_id`, `product_id`, `product_name`, `division_slug`, `hsn_code`, `width_mm`, `height_mm`, `material_id`, `material_name`, `quantity`, `unit_price_paise`, `line_subtotal_paise`, `gst_rate`, `artwork_type` (`designer`|`upload`), `design_json`, `uploaded_file_path`.

### order_events: pipeline history
`order_id`, `from_stage`, `to_stage`, `changed_by`, `notes`, `created_at`.

### production_files
`order_id`, `kind` (`pdf`|`png`|`csv_zip`), `file_name`, `storage_path`, `size_bytes`, `dpi`, `bleed_mm`.

### saved_designs
`customer_id`, `product_id`, `name`, `width_mm`, `height_mm`, `material_id`, `canvas_state`, `preview_url`, `source_order_id`.

### email_logs: exactly-once notifications
`idempotency_key` (partial unique index where `status = 'sent'`), `order_ref`, `event`, `recipient`, `subject`, `body_text`, `body_html`, `status` (`sent`|`failed`|`skipped_duplicate`), `provider`, `provider_message_id`, `error`, `metadata`.

### admin_audit_logs
`admin_id`, `admin_email`, `action`, `target_type`, `target_id`, `details`, `created_at`.

## Order lifecycle

```
designer / upload ─▶ draft (configured → artwork_ready → proof_pending)
customer approves proof ─▶ draft proof_approved
checkout ─▶ order QUOTE + payment pending, draft payment_pending ─▶ Stripe Checkout
Stripe confirms (webhook or session lookup) ─▶ order paid, QUOTE → ORDER, draft paid
pre-press: ORDER → ARTWORK → PRODUCTION (revision: ARTWORK → PROOF → customer approves → PRODUCTION)
PRODUCTION → COMPLETED (archive)
```
