"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { JobDraft } from "@/types/draft";
import { PricingBreakdown } from "@/modules/pricing/pricing-engine";
import { INDIAN_STATES, isValidPinCode, sellerStateCode } from "@/modules/pricing/gst";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, CheckCircle2, AlertCircle, Lock, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

interface ProductSummary {
  name: string;
  default_bleed_mm: number;
}

/**
 * Checkout (PRD § 05): delivery details, a GST breakdown for the delivery state,
 * and a hand-off to Stripe Checkout. Card details are entered on Stripe only.
 */
function CheckoutContent() {
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const draftId = searchParams.get("draft");
  const cancelled = searchParams.get("cancelled") === "1";

  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [pricing, setPricing] = useState<PricingBreakdown | null>(null);
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [divisionName, setDivisionName] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState(sellerStateCode());
  const [pin, setPin] = useState("");
  const [gstin, setGstin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (user?.full_name) setName((prev) => prev || user.full_name || "");
    if (user?.phone) setPhone((prev) => prev || user.phone || "");
  }, [user]);

  const loadDraft = useCallback(
    async (placeOfSupply: string) => {
      if (!draftId) {
        setGateError("No job selected. Configure a product and approve its proof before checkout.");
        setIsLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/drafts/${draftId}?placeOfSupply=${placeOfSupply}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Job not found");
        const d: JobDraft = data.draft;
        setDraft(d);
        setPricing(data.pricing);
        setProduct(data.product);
        setDivisionName(data.division?.name ?? "");
        setGateError(
          d.status === "proof_approved" || d.status === "payment_pending"
            ? null
            : d.status === "paid"
              ? "This job has already been paid for."
              : "The proof for this job has not been approved yet. Approve the proof before paying."
        );
      } catch (err: unknown) {
        setGateError(err instanceof Error ? err.message : "Failed to load the job");
      } finally {
        setIsLoading(false);
      }
    },
    [draftId]
  );

  useEffect(() => {
    loadDraft(stateCode);
  }, [loadDraft, stateCode]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!isValidPinCode(pin)) {
      setErrorMessage("Enter a valid 6-digit PIN code.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          customerName: name,
          phone,
          gstin: gstin || undefined,
          shippingAddress: { line1, line2: line2 || undefined, city, stateCode, postalCode: pin },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) throw new Error(data.error || "Checkout could not be started.");
      window.location.href = data.checkoutUrl;
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Checkout could not be started.");
      setIsProcessing(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-3" role="status">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading your job and pricing…</p>
      </div>
    );
  }

  if (gateError || !draft || !pricing || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Card className="border-destructive/40">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              <CardTitle>Checkout unavailable</CardTitle>
            </div>
            <CardDescription>{gateError || "This job could not be loaded."}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            {draft ? (
              <Link href={`/designer/${draft.productSlug}?draft=${draft.id}`}>
                <Button>Back to designer & proof</Button>
              </Link>
            ) : (
              <Link href="/calculator">
                <Button>Configure a product</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(`/checkout?draft=${draft.id}`);
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <Lock className="w-8 h-8 mx-auto text-brand-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold font-heading">Sign in to place your order</h1>
        <p className="text-muted-foreground text-sm">Your approved job is saved and will be added to your account.</p>
        <div className="flex gap-3 justify-center">
          <Link href={`/login?redirect=${redirect}&draftId=${draft.id}`}>
            <Button>Sign in</Button>
          </Link>
          <Link href={`/signup?redirect=${redirect}&draftId=${draft.id}`}>
            <Button variant="outline">Create account</Button>
          </Link>
        </div>
      </div>
    );
  }

  const approvedProof = draft.proofs.find((p) => p.version === draft.proofVersion);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-border pb-6">
        <Link
          href={`/designer/${draft.productSlug}?draft=${draft.id}`}
          className="text-xs font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to designer & proof
        </Link>
        <h1 className="text-3xl font-extrabold font-heading tracking-tight">Checkout</h1>
        <p className="text-sm text-muted-foreground mt-1">One payment for this job. Prices include GST.</p>
      </div>

      {cancelled && (
        <div role="status" className="p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-200">
          Payment was cancelled. Your approved job is saved; you can pay whenever you are ready.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        <form onSubmit={handlePay} className="lg:col-span-7 space-y-6" aria-label="Delivery details">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Delivery details</CardTitle>
              <CardDescription>We deliver within India. GST is charged for the delivery state.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Full name" value={name} onChange={setName} autoComplete="name" required />
              <Field id="phone" label="Mobile number" value={phone} onChange={setPhone} autoComplete="tel" inputMode="tel" placeholder="98100 12345" required />
              <div className="sm:col-span-2">
                <Field id="line1" label="Address line 1" value={line1} onChange={setLine1} autoComplete="address-line1" required />
              </div>
              <div className="sm:col-span-2">
                <Field id="line2" label="Address line 2 (optional)" value={line2} onChange={setLine2} autoComplete="address-line2" />
              </div>
              <Field id="city" label="City" value={city} onChange={setCity} autoComplete="address-level2" required />
              <div className="space-y-1.5">
                <Label htmlFor="state">State / UT</Label>
                <select
                  id="state"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  autoComplete="address-level1"
                  required
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field id="pin" label="PIN code" value={pin} onChange={setPin} autoComplete="postal-code" inputMode="numeric" maxLength={6} required />
              <Field id="gstin" label="GSTIN (optional, for business invoices)" value={gstin} onChange={(v) => setGstin(v.toUpperCase())} maxLength={15} />
            </CardContent>
          </Card>

          {errorMessage && (
            <div role="alert" className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive flex gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={isProcessing} data-testid="pay-button">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> : <Lock className="w-4 h-4 mr-2" aria-hidden="true" />}
            Pay {pricing.formatted.total} securely with Stripe
          </Button>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            You will enter your card or UPI details on Stripe. They never reach our servers.
          </p>
        </form>

        <aside className="lg:col-span-5 space-y-4" aria-label="Order summary">
          <Card>
            <CardHeader>
              <Badge variant="success" className="w-fit">
                <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" />
                Proof v{draft.proofVersion} approved
              </Badge>
              <CardTitle className="text-lg mt-2">{product.name}</CardTitle>
              {divisionName && <CardDescription>{divisionName}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {approvedProof?.renderedUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={approvedProof.renderedUrl} alt={`Approved proof v${draft.proofVersion}`} className="w-full rounded-md border" />
              )}
              <Row label="Size" value={`${draft.options.widthMm} × ${draft.options.heightMm} mm`} />
              <Row label="Material" value={pricing.materialName} />
              <Row label="Quantity" value={`${draft.quantity} units`} />
              <Row label="Unit price" value={pricing.formatted.unitPrice} />
              {pricing.discountPercentage > 0 && <Row label="Volume discount" value={`${pricing.discountPercentage}%`} />}
              <hr className="border-border" />
              <Row label="Taxable value" value={pricing.formatted.subtotal} />
              {pricing.isInterState ? (
                <Row label={`IGST (${pricing.gstRatePercentage}%)`} value={pricing.formatted.tax} />
              ) : (
                <>
                  <Row label={`CGST (${pricing.gstRatePercentage / 2}%)`} value={formatPaise(pricing.cgstCents)} />
                  <Row label={`SGST (${pricing.gstRatePercentage / 2}%)`} value={formatPaise(pricing.sgstCents)} />
                </>
              )}
              <div className="flex justify-between text-base font-bold pt-1" data-testid="checkout-total">
                <span>Total</span>
                <span>{pricing.formatted.total}</span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function formatPaise(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
      />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm">Loading checkout…</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
