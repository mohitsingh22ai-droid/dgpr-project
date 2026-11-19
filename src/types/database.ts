export type UserRole = "visitor" | "customer" | "admin";

export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  role: UserRole;
  company_name?: string | null;
  phone?: string | null;
  created_at: string;
}

export type DivisionSlug =
  | "labels-stickers"
  | "race-event-numbers"
  | "mtb-boards"
  | "stamps"
  | "trophies"
  | "laser-cut";

export interface Division {
  id: string;
  slug: DivisionSlug;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  accent_color: string;
  banner_image?: string;
  is_active: boolean;
  order_index: number;
}

export interface MaterialOption {
  id: string;
  name: string;
  description: string;
  multiplier: number; // e.g. 1.0, 1.25, 1.5
  badge?: string; // "Weatherproof", "Metallic", "Eco-friendly"
}

export interface Product {
  id: string;
  division_id: string;
  division_slug: DivisionSlug;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  base_price_cents: number; // minor units (paise), e.g. 250 = ₹2.50
  price_per_sq_cm_cents: number;
  min_width_mm: number;
  max_width_mm: number;
  min_height_mm: number;
  max_height_mm: number;
  default_width_mm: number;
  default_height_mm: number;
  default_bleed_mm: number;
  default_safety_margin_mm: number;
  allowed_materials: MaterialOption[];
  allowed_orientations: ("portrait" | "landscape" | "square")[];
  has_variable_data: boolean;
  variable_data_sample_headers?: string[];
  image_url: string;
  is_active: boolean;
}

export interface PricingTier {
  min_quantity: number;
  discount_percentage: number;
}

export type PipelineStage =
  | "QUOTE"
  | "ORDER"
  | "ARTWORK"
  | "PROOF"
  | "PRODUCTION"
  | "COMPLETED";

export type PaymentStatus = "pending" | "pending_payment" | "paid" | "failed" | "cancelled" | "refunded";

export interface Order {
  id: string;
  order_number: string; // e.g. DH-2026-00101
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  pipeline_stage: PipelineStage;
  payment_status: PaymentStatus;
  subtotal_cents: number;
  tax_cents: number; // total GST
  cgst_cents?: number;
  sgst_cents?: number;
  igst_cents?: number;
  place_of_supply?: string | null; // GST state code of the delivery address
  customer_gstin?: string | null;
  total_cents: number;
  currency: string;
  division_slug?: DivisionSlug;
  items?: OrderItem[];
  proof_status?: ProofStatus;
  approved_proof_version?: number;
  status_history?: Array<{
    from: PipelineStage;
    to: PipelineStage;
    changed_by: string;
    timestamp: string;
    notes?: string;
  }>;
  shipping_address: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    state_code?: string;
    postal_code: string;
    country: string;
    phone?: string;
  };
  xero_invoice_data?: {
    type: "ACCREC";
    contact_name: string;
    invoice_number: string;
    status: "AUTHORISED";
    line_items: Array<{
      description: string;
      quantity: number;
      unit_amount: number;
      account_code: string;
      tax_type: string;
    }>;
  };
  notes?: string;
  stripe_session_id?: string;
  draft_id?: string;
  proof_version?: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  division_slug: DivisionSlug;
  width_mm: number;
  height_mm: number;
  material: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  artwork_type: "in_browser_designer" | "direct_upload";
  canvas_json?: Record<string, unknown> | null;
  uploaded_file_url?: string | null;
  preview_thumbnail_url?: string | null;
  created_at: string;
}

export type ProofStatus = "pending_review" | "approved" | "changes_requested";

export interface Proof {
  id: string;
  order_item_id: string;
  order_id: string;
  version_number: number; // v1, v2, v3
  status: ProofStatus;
  watermarked_preview_url: string;
  customer_feedback?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
}

export interface ProductionFile {
  id: string;
  proof_id: string;
  order_id: string;
  order_item_id: string;
  file_name: string; // OrderID_ProductType_Date_Output.pdf
  file_type: "pdf_300dpi" | "png_300dpi" | "csv_merged_zip" | "cut_contour_vector";
  file_path: string;
  resolution_dpi: number;
  bleed_mm: number;
  is_unlocked: boolean; // LOCKED until proof is approved
  download_url?: string;
  created_at: string;
}

export interface SavedDesign {
  id: string;
  customer_id: string;
  product_id: string;
  product_name: string;
  name: string;
  width_mm: number;
  height_mm: number;
  material: string;
  canvas_state: Record<string, unknown>;
  preview_url: string;
  created_at: string;
  updated_at: string;
}

export interface VariableDataJob {
  id: string;
  order_item_id: string;
  csv_file_name: string;
  total_rows: number;
  field_mappings: Record<string, string>; // { "BibNumber": "placeholder_number", "Name": "placeholder_name" }
  status: "pending" | "processing" | "completed" | "failed";
  output_zip_url?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  order_id: string;
  actor_id: string;
  actor_name: string;
  actor_role: UserRole;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}
