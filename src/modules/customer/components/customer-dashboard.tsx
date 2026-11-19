"use client";
import { formatINR } from "@/modules/pricing/gst";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Order, Proof, SavedDesign } from "@/types/database";
import { ProofReviewDialog } from "@/modules/proofs/components/proof-review-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User,
  ShoppingBag,
  FileCheck,
  BookmarkCheck,
  Receipt,
  RotateCcw,
  CheckCircle2,
  Building,
  Mail,
  Phone,
} from "lucide-react";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CustomerDashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role, isLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [reorderSuccess, setReorderSuccess] = useState<string | null>(null);
  const [checkoutSuccessOrder, setCheckoutSuccessOrder] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"orders" | "proofs" | "designs" | "profile">("orders");
  const [selectedProofForReview, setSelectedProofForReview] = useState<Proof | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || role === "visitor")) {
      router.replace("/login?redirect=/dashboard");
    }
  }, [user, role, isLoading, router, searchParams]);

  // Authoritative server-side customer data retrieval via session cookie (PRD § 03, § 10)
  const fetchCustomerData = async () => {
    if (!user) return;
    setIsLoadingData(true);
    try {
      const [ordersRes, proofsRes, designsRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/proofs"),
        fetch("/api/designs"),
      ]);

      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        setOrders(oData.orders || []);
      }
      if (proofsRes.ok) {
        const pData = await proofsRes.json();
        setProofs(pData.proofs || []);
      }
      if (designsRes.ok) {
        const dData = await designsRes.json();
        setSavedDesigns(dData.designs || []);
      }
    } catch (err) {
      console.warn("Error loading customer data:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchCustomerData();
    }
  }, [user, role]);

  // Returning from Stripe Checkout: confirm the payment with the server (which asks
  // Stripe directly), then refresh the order list.
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (searchParams.get("checkout") !== "success" || !sessionId || !user) return;
    fetch("/api/checkout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.orderNumber) setCheckoutSuccessOrder(data.orderNumber);
        fetchCustomerData();
      })
      .catch(() => fetchCustomerData());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per return from Stripe
  }, [searchParams, user]);

  // One-click reorder (§ 09, § 10): the server copies the approved artwork into a
  // new job that already carries the approved proof, then we go straight to checkout.
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [reorderingOrder, setReorderingOrder] = useState<string | null>(null);
  const handleReorder = async (order: Order) => {
    setReorderError(null);
    setReorderingOrder(order.order_number);
    try {
      const res = await fetch(`/api/orders/${order.order_number}/reorder`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reorder failed");
      router.push(data.checkoutUrl);
    } catch (err) {
      setReorderError(err instanceof Error ? err.message : "Reorder failed");
      setReorderingOrder(null);
    }
  };

  // Handle proof approval (§ 08)
  const handleApproveProof = async (proofId: string) => {
    const targetProof = proofs.find((p) => p.id === proofId);
    if (!targetProof) return;

    try {
      // Proofs of unpaid jobs are approved on the job draft; revised proofs of paid orders on the order.
      const isDraftProof = UUID_PATTERN.test(targetProof.order_id);
      const res = isDraftProof
        ? await fetch(`/api/drafts/${targetProof.order_id}/approve-proof`, { method: "POST" })
        : await fetch(`/api/proofs/${proofId}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: targetProof.order_id, version: targetProof.version_number }),
          });

      if (res.ok) {
        setProofs((prev) =>
          prev.map((p) =>
            p.id === proofId
              ? {
                  ...p,
                  status: "approved",
                  approved_by: user?.email || user?.id,
                  approved_at: new Date().toISOString(),
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error("Failed to approve proof:", err);
    }
  };

  // Handle proof revision request (§ 08)
  const handleRequestProofChanges = async (proofId: string, feedback: string) => {
    const targetProof = proofs.find((p) => p.id === proofId);
    if (!targetProof) return;

    try {
      const isDraftProof = UUID_PATTERN.test(targetProof.order_id);
      const res = isDraftProof
        ? await fetch(`/api/drafts/${targetProof.order_id}/request-changes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback }),
          })
        : await fetch(`/api/proofs/${proofId}/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: targetProof.order_id, currentVersion: targetProof.version_number, feedback }),
          });

      if (res.ok) {
        setProofs((prev) =>
          prev.map((p) =>
            p.id === proofId
              ? {
                  ...p,
                  status: "changes_requested",
                  customer_feedback: feedback,
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error("Failed to request changes:", err);
    }
  };

  if (!user || role === "visitor") {
    return (
      <div className="p-8 text-center max-w-lg mx-auto space-y-4 border rounded-2xl bg-card my-16 shadow-elevation">
        <div className="w-14 h-14 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-600 flex items-center justify-center mx-auto">
          <User className="w-7 h-7" />
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-600 text-xs font-medium">
          Customer Portal Access
        </span>
        <h2 className="text-2xl font-bold font-heading">Sign In to View Customer Portal</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The customer dashboard is strictly isolated. You must sign in to access your order history, review versioned proofs, and access 1-click reorders.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="w-full sm:w-auto font-semibold text-xs">
            <Link href="/login">Sign In to Your Account</Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto text-xs font-mono">
            <Link href="/signup">Create New Account</Link>
          </Button>
        </div>
      </div>
    );
  }

  const pendingProofsCount = proofs.filter((p) => p.status === "pending_review").length;

  return (
    <div className="space-y-8 pb-16">
      {/* Checkout Success Notification */}
      {checkoutSuccessOrder && (
        <div className="p-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 shadow-sm flex items-start gap-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-base font-heading">
              Payment Confirmed & Order #{checkoutSuccessOrder} Placed!
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed font-sans">
              Your transactional single-order payment has been processed securely. The job has officially entered the <strong>ORDER</strong> stage in our production pipeline. A GST tax invoice is ready below.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner / Account Profile Status (§ 10 Module 1) */}
      <div className="p-6 rounded-xl bg-card border shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center font-bold text-xl border border-brand-500/20">
            {user?.full_name?.charAt(0) || "U"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold font-heading text-foreground">
                {user?.full_name || "Customer Account"}
              </h1>
              <Badge variant="success" className="text-[10px]">
                Active Account
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-brand-500" />
                {user?.company_name || <span className="text-muted-foreground/60 italic">Individual Account</span>}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" />
                {user?.email}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {user?.phone ? user.phone : <span className="text-muted-foreground/60 italic">Add phone</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Summary Pill - authoritatively computed from user's rows */}
        <div className="flex items-center gap-3 bg-secondary/50 p-2.5 rounded-lg border text-xs font-mono">
          <div>
            <span className="text-muted-foreground block text-[10px]">ORDERS</span>
            <span className="font-bold text-foreground">{orders.length} Total</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div>
            <span className="text-muted-foreground block text-[10px]">PENDING PROOFS</span>
            <span className="font-bold text-brand-500">
              {pendingProofsCount} Awaiting
            </span>
          </div>
        </div>
      </div>

      {reorderSuccess && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{reorderSuccess}</span>
        </div>
      )}

      {reorderError && (
        <div role="alert" className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {reorderError}
        </div>
      )}

      {isLoadingData && (
        <div role="status" className="text-sm text-muted-foreground flex items-center gap-2" data-testid="dashboard-loading">
          <span className="w-3 h-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" aria-hidden="true" />
          Loading your orders, proofs and designs…
        </div>
      )}

      {/* Navigation Tabs (§ 10 modules) */}
      <div className="flex gap-2 border-b border-border pb-2 text-sm font-semibold overflow-x-auto -mx-1 px-1" role="tablist">
        <button
          onClick={() => setActiveTab("orders")}
          className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
            activeTab === "orders"
              ? "bg-industrial-950 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Order History & 1-Click Reorder</span>
          <Badge variant="outline" className="ml-1 text-[10px]">{orders.length}</Badge>
        </button>

        <button
          onClick={() => setActiveTab("proofs")}
          className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
            activeTab === "proofs"
              ? "bg-industrial-950 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Active Proofs & Approvals</span>
          <Badge variant={pendingProofsCount > 0 ? "destructive" : "outline"} className="ml-1 text-[10px]">
            {pendingProofsCount}
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab("designs")}
          className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
            activeTab === "designs"
              ? "bg-industrial-950 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookmarkCheck className="w-4 h-4" />
          <span>Saved Designs</span>
          <Badge variant="outline" className="ml-1 text-[10px]">{savedDesigns.length}</Badge>
        </button>
      </div>

      {/* TAB 1: ORDER HISTORY & 1-CLICK REORDER (§ 10 Module 2 & 5) */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold font-heading">Past Orders & Production Pipeline Status</h2>
            <span className="text-xs font-mono text-muted-foreground">
              Instant 1-Click re-ordering from approved artwork
            </span>
          </div>

          {orders.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <h3 className="font-heading font-bold text-base text-foreground mb-1">No Orders Placed Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Custom print jobs, manufacturing status updates, and downloadable GST tax invoices will appear here once you place an order.
              </p>
              <Button asChild size="sm" className="text-xs font-semibold bg-brand-500 hover:bg-brand-600">
                <Link href="/#divisions">Browse Products & Catalog</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((ord) => {
                const stageColors: Record<string, string> = {
                  QUOTE: "bg-gray-100 text-gray-800",
                  ORDER: "bg-blue-100 text-blue-800",
                  ARTWORK: "bg-purple-100 text-purple-800",
                  PROOF: "bg-amber-100 text-amber-800 font-semibold",
                  PRODUCTION: "bg-orange-100 text-orange-800 font-semibold",
                  COMPLETED: "bg-emerald-100 text-emerald-800 font-semibold",
                };

                return (
                  <Card key={ord.id} className="p-6 hover-lift">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-base text-foreground">
                            {ord.order_number}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono ${stageColors[ord.pipeline_stage] || ""}`}>
                            {ord.pipeline_stage}
                          </span>
                          <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-300">
                            {ord.payment_status.toUpperCase()}
                          </Badge>
                        </div>

                        <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                          <div>Placed: {new Date(ord.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</div>
                          <div data-testid="order-shipping-address">
                            Shipping to: {ord.shipping_address?.line1}, {ord.shipping_address?.city}, {ord.shipping_address?.postal_code}, {ord.shipping_address?.country}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2 lg:pt-0 border-t lg:border-t-0">
                        <div className="text-right mr-2">
                          <span className="text-[10px] font-mono text-muted-foreground block">TOTAL (INC. GST)</span>
                          <span className="font-mono font-bold text-lg text-foreground">
                            {formatINR(ord.total_cents)}
                          </span>
                        </div>

                        {/* Downloadable Tax Invoice (§ 10 Module 6) */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            window.open(`/api/orders/${ord.order_number}/invoice`, "_blank");
                          }}
                          className="text-xs font-mono"
                          title="Download Xero-compliant GST invoice PDF"
                        >
                          <Receipt className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                          Invoice PDF
                        </Button>

                        {/* 1-Click Reorder (§ 10 Module 5) */}
                        {ord.payment_status === "paid" && (
                          <Button
                            size="sm"
                            onClick={() => handleReorder(ord)}
                            disabled={reorderingOrder !== null}
                            className="font-semibold text-xs shadow-sm bg-brand-500 hover:bg-brand-600"
                            data-testid="reorder-button"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                            {reorderingOrder === ord.order_number ? "Preparing…" : "1-Click Reorder"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVE PROOFS & VERSION CONTROL (§ 10 Module 4 & § 08) */}
      {activeTab === "proofs" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold font-heading">Digital Proofs & Version Approvals</h2>
              <p className="text-xs text-muted-foreground">
                Inspect artwork previews before production unlocks. Every revision is version-controlled.
              </p>
            </div>
          </div>

          {proofs.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <FileCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <h3 className="font-heading font-bold text-base text-foreground mb-1">No Active Digital Proofs</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Artwork proofs requiring sign-off will appear here once an order enters the PROOF stage.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {proofs.map((prf) => (
                <Card key={prf.id} className="overflow-hidden flex flex-col justify-between hover-lift">
                  <div>
                    <div className="aspect-[16/10] bg-industrial-950 relative overflow-hidden group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={prf.watermarked_preview_url}
                        alt="Proof Preview"
                        className="w-full h-full object-cover opacity-90"
                      />
                      {/* Watermark badge overlay (§ 08) */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-white/30 text-2xl font-mono font-extrabold uppercase tracking-widest rotate-[-15deg]">
                          W2P PROOF · v{prf.version_number}
                        </span>
                      </div>

                      <div className="absolute top-3 left-3 flex gap-2">
                        <Badge variant="industrial" className="text-xs">
                          REVISION v{prf.version_number}
                        </Badge>
                        {prf.status === "approved" ? (
                          <Badge variant="success" className="text-xs">
                            APPROVED & UNLOCKED
                          </Badge>
                        ) : prf.status === "changes_requested" ? (
                          <Badge variant="destructive" className="text-xs">
                            CHANGES REQUESTED
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-xs animate-pulse">
                            AWAITING YOUR APPROVAL
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardContent className="p-5 space-y-3">
                      <div className="flex justify-between text-xs font-mono text-muted-foreground">
                        <span>Associated Order:</span>
                        <span className="font-bold text-foreground">{prf.order_id}</span>
                      </div>

                      {prf.customer_feedback && (
                        <div className="p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono">
                          <span className="font-bold block">Revision Requested:</span>
                          {prf.customer_feedback}
                        </div>
                      )}

                      {prf.approved_at && (
                        <div className="p-3 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 text-emerald-800 dark:text-emerald-300 text-xs font-mono">
                          <span className="font-bold block">Approved for Manufacture:</span>
                          {new Date(prf.approved_at).toLocaleString("en-IN")}
                        </div>
                      )}
                    </CardContent>
                  </div>

                  <div className="p-5 pt-0">
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProofForReview(prf)}
                        className="text-xs"
                      >
                        Inspect Proof
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setSelectedProofForReview(prf)}
                        className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        {prf.status === "approved" ? "View Sign-Off" : "Review & Sign"}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SAVED DESIGNS & REUSE (§ 10 Module 3 & § 09) */}
      {activeTab === "designs" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold font-heading">Saved Custom Designs Library</h2>
            <span className="text-xs font-mono text-muted-foreground">
              Stored artwork assets ready for repeat manufacturing
            </span>
          </div>

          {savedDesigns.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <BookmarkCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <h3 className="font-heading font-bold text-base text-foreground mb-1">No Saved Designs in Library</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Save artwork designs in the visual designer to reuse them anytime for instant 1-click reorders.
              </p>
              <Button asChild size="sm" className="text-xs font-semibold bg-brand-500 hover:bg-brand-600">
                <Link href="/designer/custom-die-cut-vinyl">Open Visual Designer</Link>
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedDesigns.map((des) => (
                <Card key={des.id} className="overflow-hidden border-border hover:border-brand-500 transition-colors">
                  <div className="aspect-[4/3] bg-muted overflow-hidden relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={des.preview_url}
                      alt={des.name}
                      className="w-full h-full object-cover"
                    />
                    <Badge variant="industrial" className="absolute top-3 right-3 text-[10px]">
                      {des.width_mm}mm × {des.height_mm}mm
                    </Badge>
                  </div>
                  <CardContent className="p-5 space-y-3">
                    <div>
                      <h4 className="font-bold text-base font-heading">{des.name}</h4>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{des.material}</p>
                    </div>
                    <div className="pt-3 border-t flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => router.push(`/designer/${(des as SavedDesign & { product_slug?: string }).product_slug || des.product_id}?design=${des.id}`)}
                        className="w-full text-xs font-semibold"
                      >
                        Open in Designer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROOF REVIEW & APPROVAL DIALOG (§ 08) */}
      {selectedProofForReview && (
        <ProofReviewDialog
          proof={{
            id: selectedProofForReview.id,
            orderId: selectedProofForReview.order_id,
            orderItemId: selectedProofForReview.order_item_id,
            version: selectedProofForReview.version_number,
            status: selectedProofForReview.status,
            previewUrl: selectedProofForReview.watermarked_preview_url,
            customerFeedback: selectedProofForReview.customer_feedback,
            approvedBy: selectedProofForReview.approved_by,
            approvedAt: selectedProofForReview.approved_at,
            createdAt: selectedProofForReview.created_at,
            metadata: {
              version: selectedProofForReview.version_number,
              widthMm: 175,
              heightMm: 155,
              materialName: "0.8mm Flexible Polypropylene",
              bleedMm: 4.0,
              orderNumber: selectedProofForReview.order_id,
              createdAt: selectedProofForReview.created_at,
            },
          }}
          customerEmail={user?.email || "customer@example.com"}
          onApprove={(id) => {
            handleApproveProof(id);
            setReorderSuccess(`Proof v${selectedProofForReview.version_number} formally APPROVED. Production files are now unlocked!`);
            setTimeout(() => setReorderSuccess(null), 5000);
          }}
          onRequestChanges={(id, feedback) => {
            handleRequestProofChanges(id, feedback);
            setReorderSuccess(`Revision request logged: "${feedback}". Pre-press operator notified.`);
            setTimeout(() => setReorderSuccess(null), 5000);
          }}
          onClose={() => setSelectedProofForReview(null)}
        />
      )}
    </div>
  );
}
