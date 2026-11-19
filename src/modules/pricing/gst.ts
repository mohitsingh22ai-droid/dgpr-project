/**
 * GST helpers (India). Pure functions shared by client and server.
 *
 * The seller is registered in SELLER_STATE_CODE (default 07 = Delhi). Supplies
 * delivered inside that state carry CGST + SGST (half the rate each); supplies
 * to any other state carry IGST at the full rate.
 */

export const INDIAN_STATES: Array<{ code: string; name: string }> = [
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "18", name: "Assam" },
  { code: "10", name: "Bihar" },
  { code: "04", name: "Chandigarh" },
  { code: "22", name: "Chhattisgarh" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "07", name: "Delhi" },
  { code: "30", name: "Goa" },
  { code: "24", name: "Gujarat" },
  { code: "06", name: "Haryana" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "01", name: "Jammu and Kashmir" },
  { code: "20", name: "Jharkhand" },
  { code: "29", name: "Karnataka" },
  { code: "32", name: "Kerala" },
  { code: "38", name: "Ladakh" },
  { code: "31", name: "Lakshadweep" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "27", name: "Maharashtra" },
  { code: "14", name: "Manipur" },
  { code: "17", name: "Meghalaya" },
  { code: "15", name: "Mizoram" },
  { code: "13", name: "Nagaland" },
  { code: "21", name: "Odisha" },
  { code: "34", name: "Puducherry" },
  { code: "03", name: "Punjab" },
  { code: "08", name: "Rajasthan" },
  { code: "11", name: "Sikkim" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "16", name: "Tripura" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "05", name: "Uttarakhand" },
  { code: "19", name: "West Bengal" },
];

export const DEFAULT_SELLER_STATE_CODE = "07";

export function sellerStateCode(): string {
  const configured = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SELLER_STATE_CODE || process.env.SELLER_STATE_CODE : undefined;
  return configured && /^\d{2}$/.test(configured) ? configured : DEFAULT_SELLER_STATE_CODE;
}

export function isValidStateCode(code: string | null | undefined): code is string {
  return !!code && INDIAN_STATES.some((s) => s.code === code);
}

export function stateName(code: string | null | undefined): string {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? "";
}

export interface GstSplit {
  gstRatePercentage: number;
  placeOfSupply: string;
  isInterState: boolean;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  taxCents: number;
}

/**
 * Splits GST on a taxable amount (paise). Without a known place of supply the
 * supply is treated as intra-state (the seller's own state) for quoting.
 */
export function splitGst(taxableCents: number, gstRatePercentage: number, placeOfSupply?: string | null): GstSplit {
  const seller = sellerStateCode();
  const pos = isValidStateCode(placeOfSupply) ? placeOfSupply : seller;
  const isInterState = pos !== seller;
  const taxCents = Math.round((taxableCents * gstRatePercentage) / 100);

  if (isInterState) {
    return { gstRatePercentage, placeOfSupply: pos, isInterState, cgstCents: 0, sgstCents: 0, igstCents: taxCents, taxCents };
  }
  const cgstCents = Math.floor(taxCents / 2);
  return { gstRatePercentage, placeOfSupply: pos, isInterState, cgstCents, sgstCents: taxCents - cgstCents, igstCents: 0, taxCents };
}

/** Indian PIN code: 6 digits, first digit 1–9. */
export function isValidPinCode(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin.replace(/\s+/g, ""));
}

const inrFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** Formats paise as rupees, e.g. 123456 → "₹1,234.56". */
export function formatINR(paise: number): string {
  return inrFormatter.format(paise / 100);
}
