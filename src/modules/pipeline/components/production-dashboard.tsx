"use client";
import { formatINR } from "@/modules/pricing/gst";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PipelineStage } from "@/types/database";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Archive,
  ArrowRight,
  Layers,
  Users,
  Settings,
  RefreshCw,
  AlertTriangle,
  Eye,
  PackageCheck,
  Ban,
  X,
} from "lucide-react";

export function ProductionDashboardView() {
  const router = useRouter();
  const { role, user, isLoading } = useAuth();

  // Active Navigation Tab: orders | users | products | reports | archive
  const [activeTab, setActiveTab] = useState<"orders" | "users" | "products" | "reports" | "archive">("orders");

  // Orders State
  const [orders, setOrders] = useState<any[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("ALL");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>("ALL");
  const [selectedDivision, setSelectedDivision] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // UI / Action Feedback
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error" | "conflict"; text: string } | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any | null>(null);

  // Users State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  // Products State
  const [productsList, setProductsList] = useState<any[]>([]);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productFormError, setProductFormError] = useState<string | null>(null);

  // Reports State
  const [reportsData, setReportsData] = useState<any | null>(null);
  const [isReportsLoading, setIsReportsLoading] = useState(false);

  // Archive State
  const [archiveOrders, setArchiveOrders] = useState<any[]>([]);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);

  // 1. Guard check: Only admins are permitted (PRD § 03, § 11)
  useEffect(() => {
    if (!isLoading && (!user || role !== "admin")) {
      // If user is visitor or non-admin customer, redirect to login
      router.replace("/login?redirect=/production");
    }
  }, [user, role, isLoading, router]);

  // Fetch Orders from Server-Side Admin API (Layer 2 Server Check)
  const ordersRequestRef = useRef(0);
  const fetchOrders = useCallback(async () => {
    // Ignore responses to older requests so a slow reply cannot overwrite newer filters.
    const requestId = ++ordersRequestRef.current;
    setIsOrdersLoading(true);
    setOrdersError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("query", searchQuery.trim());
      if (selectedStage !== "ALL") params.set("stage", selectedStage);
      if (selectedPaymentStatus !== "ALL") params.set("payment_status", selectedPaymentStatus);
      if (selectedDivision !== "ALL") params.set("product_type", selectedDivision);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      params.set("page", page.toString());
      params.set("limit", "15");

      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (res.status === 401 || res.status === 403) {
        setOrdersError("Forbidden: Administrator privileges required to access this endpoint.");
        setIsOrdersLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to load orders (${res.status})`);
      }

      const data = await res.json();
      if (requestId !== ordersRequestRef.current) return;
      setOrders(data.orders || []);
      setTotalOrders(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: unknown) {
      setOrdersError(err instanceof Error ? err.message : "Error loading orders");
    } finally {
      setIsOrdersLoading(false);
    }
  }, [searchQuery, selectedStage, selectedPaymentStatus, selectedDivision, dateFrom, dateTo, page]);

  useEffect(() => {
    if (role === "admin") {
      fetchOrders();
    }
  }, [role, fetchOrders]);

  // Fetch Users
  const fetchUsers = async () => {
    setIsUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (err) {
      console.warn("Failed to fetch users:", err);
    } finally {
      setIsUsersLoading(false);
    }
  };

  // Fetch Products
  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/admin/products");
      if (res.ok) {
        const data = await res.json();
        setProductsList(data.products || []);
      }
    } catch (err) {
      console.warn("Failed to fetch products:", err);
    }
  };

  // Fetch Reports
  const fetchReports = async () => {
    setIsReportsLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReportsData(data);
      }
    } catch (err) {
      console.warn("Failed to fetch reports:", err);
    } finally {
      setIsReportsLoading(false);
    }
  };

  // Fetch Archive
  const fetchArchive = async () => {
    setIsArchiveLoading(true);
    try {
      const res = await fetch("/api/admin/archive");
      if (res.ok) {
        const data = await res.json();
        setArchiveOrders(data.orders || []);
      }
    } catch (err) {
      console.warn("Failed to fetch archive:", err);
    } finally {
      setIsArchiveLoading(false);
    }
  };

  // Advance / Retreat Pipeline Stage with Optimistic Locking (PRD § 11, § 13)
  const handleUpdateStage = async (order: any, targetStage: PipelineStage) => {
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.order_number}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: targetStage,
          expectedStage: order.pipeline_stage,
          notes: `Stage updated to ${targetStage} via Admin Console`,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setFeedbackMsg({
          type: "conflict",
          text: `Stale order stage conflict! Order ${order.order_number} was modified by another operator. Reloading latest state.`,
        });
        await fetchOrders();
        return;
      }

      if (!res.ok) {
        setFeedbackMsg({
          type: "error",
          text: data.error || `Could not transition stage to ${targetStage}`,
        });
        return;
      }

      setFeedbackMsg({
        type: "success",
        text: `Order ${order.order_number} transitioned to ${targetStage}. Customer notification email logged.`,
      });
      await fetchOrders();
    } catch (err: unknown) {
      setFeedbackMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Network error updating stage",
      });
    }
  };

  // Download Production Files with Signed URL (PRD § 11, § 13)
  const handleDownloadProduction = async (order: any) => {
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.order_number}/download-production`);
      const data = await res.json();

      if (!res.ok) {
        setFeedbackMsg({
          type: "error",
          text: data.reason || data.error || "Cannot download: Order not ready for production.",
        });
        return;
      }

      setFeedbackMsg({
        type: "success",
        text: `Signed 60-second production download URL generated for ${order.order_number}. Download logged in audit trail.`,
      });

      // Trigger download
      window.open(data.downloadUrl, "_blank");
    } catch (err: unknown) {
      setFeedbackMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Download request failed",
      });
    }
  };

  // Role Switch Handler
  const handleRoleChange = async (userId: string, newRole: "customer" | "admin") => {
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedbackMsg({ type: "error", text: data.error || "Role change blocked" });
        return;
      }

      setFeedbackMsg({ type: "success", text: `User role updated to ${newRole}.` });
      await fetchUsers();
    } catch {
      setFeedbackMsg({ type: "error", text: "Role update failed." });
    }
  };

  // User Deactivate/Reactivate Handler
  const handleStatusToggle = async (userId: string, currentStatus: boolean) => {
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedbackMsg({ type: "error", text: data.error || "Status update blocked" });
        return;
      }

      setFeedbackMsg({
        type: "success",
        text: `User account ${!currentStatus ? "activated" : "deactivated"} successfully.`,
      });
      await fetchUsers();
    } catch {
      setFeedbackMsg({ type: "error", text: "Status update failed." });
    }
  };

  // Save Product Updates
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setProductFormError(null);

    try {
      const res = await fetch(`/api/admin/products/${editingProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_price_cents: Number(editingProduct.base_price_cents),
          price_per_sq_cm_cents: Number(editingProduct.price_per_sq_cm_cents),
          pricing_tiers: editingProduct.pricing_tiers,
          gst_rate: Number(editingProduct.gst_rate ?? 18),
          hsn_code: editingProduct.hsn_code || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setProductFormError(data.error || "Failed to update product");
        return;
      }

      setFeedbackMsg({
        type: "success",
        text: `Product '${editingProduct.name}' updated! Changes are live on the storefront without redeploy.`,
      });
      setEditingProduct(null);
      await fetchProducts();
    } catch (err: unknown) {
      setProductFormError(err instanceof Error ? err.message : "Error saving product");
    }
  };


  // If user is not admin, show access denied state
  if (!isLoading && (!user || role !== "admin")) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center" data-testid="admin-403-message">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
          <Ban className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-2">
          403 — Administrator Access Required
        </h1>
        <p className="text-neutral-600 mb-6">
          The production shop-floor console requires an authenticated administrator session. You are currently logged in as a {role}.
        </p>
        <Link href="/login?redirect=/production">
          <Button className="bg-[#FF5A1F] hover:bg-[#E0480F] text-white">
            Sign in as Administrator
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-console">
      {/* Top Banner & Tab Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider uppercase text-neutral-500">
              PRD § 11 Internal Pipeline
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">
            Production & Shop-Floor Console
          </h1>
          <p className="text-sm text-neutral-500">
            Internal manufacturing ERP: 6-stage sequential pipeline, proof gates, user administration, and reports.
          </p>
        </div>

        {/* Global Admin Tabs */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 overflow-x-auto max-w-full">
          <button
            onClick={() => {
              setActiveTab("orders");
              fetchOrders();
            }}
            data-testid="admin-orders-tab"
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === "orders" ? "bg-white text-neutral-900 shadow-sm font-semibold" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1" />
            Orders & Pipeline ({totalOrders})
          </button>
          <button
            onClick={() => {
              setActiveTab("users");
              fetchUsers();
            }}
            data-testid="admin-users-tab"
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === "users" ? "bg-white text-neutral-900 shadow-sm font-semibold" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <Users className="w-3.5 h-3.5 inline mr-1" />
            Users
          </button>
          <button
            onClick={() => {
              setActiveTab("products");
              fetchProducts();
            }}
            data-testid="admin-products-tab"
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === "products" ? "bg-white text-neutral-900 shadow-sm font-semibold" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <Settings className="w-3.5 h-3.5 inline mr-1" />
            Products & Tiers
          </button>
          <button
            onClick={() => {
              setActiveTab("reports");
              fetchReports();
            }}
            data-testid="admin-reports-tab"
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === "reports" ? "bg-white text-neutral-900 shadow-sm font-semibold" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 inline mr-1" />
            Reports & Analytics
          </button>
          <button
            onClick={() => {
              setActiveTab("archive");
              fetchArchive();
            }}
            data-testid="admin-archive-tab"
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === "archive" ? "bg-white text-neutral-900 shadow-sm font-semibold" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <Archive className="w-3.5 h-3.5 inline mr-1" />
            Archive
          </button>
        </div>
      </div>

      {/* Global Toast / Feedback Banner */}
      {feedbackMsg && (
        <div
          data-testid={feedbackMsg.type === "conflict" ? "admin-conflict-toast" : "admin-feedback-toast"}
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            feedbackMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : feedbackMsg.type === "conflict"
              ? "bg-amber-50 border-amber-300 text-amber-900 font-medium"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {feedbackMsg.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : feedbackMsg.type === "conflict" ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5 animate-bounce" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm">{feedbackMsg.text}</div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-neutral-400 hover:text-neutral-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: ORDERS & PIPELINE */}
      {activeTab === "orders" && (
        <div className="space-y-6">
          {/* Combinable Filters & Search (PRD § 11 Capability 01) */}
          <Card className="border-neutral-200 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Search query */}
                <div className="lg:col-span-2">
                  <Label htmlFor="admin-search" className="text-xs font-semibold text-neutral-600 mb-1 block">
                    Search Order # / Customer / Email
                  </Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
                    <Input
                      id="admin-search"
                      data-testid="admin-search-input"
                      placeholder="e.g. DH-2026-00101, Customer name..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Stage Filter */}
                <div>
                  <Label htmlFor="stage-filter" className="text-xs font-semibold text-neutral-600 mb-1 block">
                    Pipeline Stage
                  </Label>
                  <select
                    id="stage-filter"
                    data-testid="admin-stage-filter"
                    value={selectedStage}
                    onChange={(e) => {
                      setSelectedStage(e.target.value);
                      setPage(1);
                    }}
                    className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  >
                    <option value="ALL">All Stages</option>
                    <option value="QUOTE">QUOTE</option>
                    <option value="ORDER">ORDER</option>
                    <option value="ARTWORK">ARTWORK</option>
                    <option value="PROOF">PROOF</option>
                    <option value="PRODUCTION">PRODUCTION</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>

                {/* Payment Status Filter */}
                <div>
                  <Label htmlFor="payment-filter" className="text-xs font-semibold text-neutral-600 mb-1 block">
                    Payment Status
                  </Label>
                  <select
                    id="payment-filter"
                    data-testid="admin-payment-filter"
                    value={selectedPaymentStatus}
                    onChange={(e) => {
                      setSelectedPaymentStatus(e.target.value);
                      setPage(1);
                    }}
                    className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  >
                    <option value="ALL">All Payments</option>
                    <option value="paid">Paid (Confirmed)</option>
                    <option value="pending">Pending Payment</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Division Filter */}
                <div>
                  <Label htmlFor="division-filter" className="text-xs font-semibold text-neutral-600 mb-1 block">
                    Division
                  </Label>
                  <select
                    id="division-filter"
                    data-testid="admin-division-filter"
                    value={selectedDivision}
                    onChange={(e) => {
                      setSelectedDivision(e.target.value);
                      setPage(1);
                    }}
                    className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  >
                    <option value="ALL">All Divisions</option>
                    <option value="labels-stickers">Labels & Stickers</option>
                    <option value="race-event-numbers">Race & Event Numbers</option>
                    <option value="mtb-boards">MTB Boards</option>
                    <option value="stamps">Stamps</option>
                    <option value="trophies">Trophies & Awards</option>
                    <option value="laser-cut">Laser-Cut Work</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders Table & State Handling */}
          {isOrdersLoading ? (
            <div className="py-12 text-center text-neutral-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF5A1F]" />
              Loading persistent orders from database...
            </div>
          ) : ordersError ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center text-red-800">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
              <p className="font-semibold">{ordersError}</p>
              <Button onClick={() => fetchOrders()} className="mt-3" variant="outline">
                Retry Query
              </Button>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-neutral-200 rounded-xl">
              <PackageCheck className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-neutral-900">No matching orders found</h3>
              <p className="text-sm text-neutral-500 mt-1">
                Try adjusting your search query, status filters, or date range.
              </p>
            </div>
          ) : (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase text-neutral-600 tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Order / Customer</th>
                      <th className="py-3.5 px-4">Destination</th>
                      <th className="py-3.5 px-4">Stage</th>
                      <th className="py-3.5 px-4">Payment</th>
                      <th className="py-3.5 px-4">Ready Gate</th>
                      <th className="py-3.5 px-4 text-right">Total</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {orders.map((ord) => {
                      const addr = ord.shipping_address || {};
                      const nextStageMap: Record<PipelineStage, PipelineStage | null> = {
                        QUOTE: "ORDER",
                        ORDER: "ARTWORK",
                        ARTWORK: "PROOF",
                        PROOF: "PRODUCTION",
                        PRODUCTION: "COMPLETED",
                        COMPLETED: null,
                      };
                      const nextStage = nextStageMap[ord.pipeline_stage as PipelineStage];

                      return (
                        <tr
                          key={ord.order_number}
                          data-testid="admin-order-row"
                          className="hover:bg-neutral-50/70 transition-colors"
                        >
                          {/* Order / Customer */}
                          <td className="py-4 px-4">
                            <div className="font-semibold text-neutral-900" data-testid="admin-order-number">
                              {ord.order_number}
                            </div>
                            <div className="text-xs text-neutral-600" data-testid="admin-customer-name">
                              {ord.customer_name || ord.customer_email}
                            </div>
                            <div className="text-[11px] text-neutral-400">
                              {new Date(ord.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                          </td>

                          {/* Shipping Destination */}
                          <td className="py-4 px-4 text-xs" data-testid="admin-shipping-address">
                            <div className="font-medium text-neutral-800">{addr.name}</div>
                            <div className="text-neutral-500">{addr.line1}</div>
                            <div className="text-neutral-500">
                              {addr.city}, {addr.postal_code}
                            </div>
                          </td>

                          {/* Pipeline Stage */}
                          <td className="py-4 px-4">
                            <Badge
                              className={`text-[11px] font-semibold tracking-wide ${
                                ord.pipeline_stage === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                  : ord.pipeline_stage === "PRODUCTION"
                                  ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
                                  : "bg-neutral-100 text-neutral-800 hover:bg-neutral-100"
                              }`}
                            >
                              {ord.pipeline_stage}
                            </Badge>
                          </td>

                          {/* Payment Status */}
                          <td className="py-4 px-4">
                            <Badge
                              className={`text-[11px] font-semibold ${
                                ord.payment_status === "paid"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : ord.payment_status === "cancelled"
                                  ? "bg-neutral-100 text-neutral-500"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {ord.payment_status}
                            </Badge>
                          </td>

                          {/* Ready for Production Indicator (PRD § 11, § 08) */}
                          <td className="py-4 px-4">
                            <div
                              data-testid="admin-ready-indicator"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                                ord.isReadyForProduction
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                  : "bg-amber-50 border-amber-200 text-amber-700"
                              }`}
                            >
                              {ord.isReadyForProduction ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Ready
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                  <span className="truncate max-w-[130px]" title={ord.notReadyReason || "Not ready"}>
                                    {ord.notReadyReason ? "Locked" : "Not ready"}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Total Gross */}
                          <td className="py-4 px-4 text-right font-semibold text-neutral-900" data-testid="admin-order-total">
                            {formatINR(ord.total_cents)}
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Order Detail Button */}
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid="admin-order-detail-btn"
                                onClick={() => setSelectedOrderDetail(ord)}
                                className="h-8 px-2 text-xs"
                                title="View Order Detail & History"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>

                              {/* Advance Stage Button (Forward 1 step) */}
                              {nextStage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  data-testid="admin-advance-stage-btn"
                                  onClick={() => handleUpdateStage(ord, nextStage)}
                                  className="h-8 px-2 text-xs bg-neutral-50 hover:bg-neutral-100"
                                  title={`Advance to ${nextStage}`}
                                >
                                  <ArrowRight className="w-3.5 h-3.5 mr-1" />
                                  {nextStage}
                                </Button>
                              )}

                              {/* Download Production Button (Protected by Ready Gate) */}
                              <Button
                                size="sm"
                                data-testid="admin-download-btn"
                                onClick={() => handleDownloadProduction(ord)}
                                disabled={!ord.isReadyForProduction}
                                className={`h-8 px-2 text-xs text-white ${
                                  ord.isReadyForProduction
                                    ? "bg-[#FF5A1F] hover:bg-[#E0480F]"
                                    : "bg-neutral-300 cursor-not-allowed text-neutral-500"
                                }`}
                                title={ord.isReadyForProduction ? "Download 300 DPI Production Package" : ord.notReadyReason || "Locked"}
                              >
                                <Download className="w-3.5 h-3.5 mr-1" />
                                Files
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="py-3 px-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-600">
                  <div>
                    Page {page} of {totalPages} ({totalOrders} total orders)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-7 px-2 text-xs"
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="h-7 px-2 text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: USERS MANAGEMENT (PRD § 03, § 11) */}
      {activeTab === "users" && (
        <Card className="border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">User Accounts & Roles</CardTitle>
            <CardDescription className="text-xs">
              Manage internal staff privileges, inspect customer order counts, and toggle account activation. Safeguards prevent self-demotion or removal of the last administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isUsersLoading ? (
              <div className="py-8 text-center text-neutral-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FF5A1F]" />
                Loading accounts...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-600 border-b border-neutral-200">
                    <tr>
                      <th className="py-3 px-4">Name / Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Orders</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Role Switch</th>
                      <th className="py-3 px-4 text-center">Account Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {usersList.map((u) => (
                      <tr key={u.id} data-testid="admin-user-row" className="hover:bg-neutral-50/70">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-neutral-900">{u.full_name || u.email}</div>
                          <div className="text-xs text-neutral-500">{u.email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            className={
                              u.role === "admin"
                                ? "bg-purple-100 text-purple-800 border-purple-200"
                                : "bg-neutral-100 text-neutral-800 border-neutral-200"
                            }
                          >
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-neutral-800">{u.orderCount || 0}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              u.isActive ? "text-emerald-700" : "text-red-600"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-red-500"}`}
                            />
                            {u.isActive ? "Active" : "Deactivated"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <select
                            data-testid="admin-user-role-select"
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as "customer" | "admin")}
                            className="text-xs border border-neutral-300 rounded px-2 py-1 bg-white"
                          >
                            <option value="customer">customer</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid="admin-user-status-btn"
                            onClick={() => handleStatusToggle(u.id, u.isActive)}
                            className={`h-7 px-2.5 text-xs ${
                              u.isActive ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            {u.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: PRODUCTS & PRICING TIERS (PRD § 03, § 14) */}
      {activeTab === "products" && (
        <div className="space-y-6">
          <Card className="border-neutral-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Parameter-Driven Products & Pricing Tiers</CardTitle>
              <CardDescription className="text-xs">
                Edits take effect immediately on storefront calculations without a code deployment. Tier floors must be consistent and non-overlapping.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {productsList.map((prod) => (
                  <Card key={prod.id} data-testid="admin-product-row" className="border-neutral-200 shadow-sm flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-neutral-100 text-neutral-800 text-[10px] uppercase">
                          {prod.division_slug}
                        </Badge>
                        <span className="text-xs font-semibold text-[#FF5A1F]">
                          {formatINR(prod.base_price_cents)} base
                        </span>
                      </div>
                      <CardTitle className="text-base mt-2">{prod.name}</CardTitle>
                      <CardDescription className="text-xs line-clamp-2">{prod.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="text-xs text-neutral-600 flex justify-between">
                        <span>Price per sq cm:</span>
                        <span className="font-semibold">{formatINR(prod.price_per_sq_cm_cents)}</span>
                      </div>
                      <div className="text-xs text-neutral-600 flex justify-between">
                        <span>Print area:</span>
                        <span>{prod.min_width_mm}mm - {prod.max_width_mm}mm</span>
                      </div>
                      <div className="text-xs text-neutral-600 flex justify-between">
                        <span>Volume discount tiers:</span>
                        <span>{prod.pricing_tiers?.length || 0} tiers configured</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingProduct({ ...prod });
                          setProductFormError(null);
                        }}
                        className="w-full mt-3 text-xs"
                      >
                        Edit Pricing & Tiers
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Edit Product Modal / Drawer */}
          {editingProduct && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                  <h3 className="font-bold text-lg text-neutral-900">Edit {editingProduct.name}</h3>
                  <button onClick={() => setEditingProduct(null)} className="text-neutral-400 hover:text-neutral-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {productFormError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                    {productFormError}
                  </div>
                )}

                <form onSubmit={handleSaveProduct} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="base-price" className="text-xs font-semibold text-neutral-700">
                      Base Price (paise)
                    </Label>
                    <Input
                      id="base-price"
                      data-testid="admin-product-base-price"
                      type="number"
                      min="0"
                      value={editingProduct.base_price_cents}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, base_price_cents: Number(e.target.value) })
                      }
                      className="mt-1"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="sq-cm-price" className="text-xs font-semibold text-neutral-700">
                      Price per Sq Cm (paise)
                    </Label>
                    <Input
                      id="sq-cm-price"
                      type="number"
                      min="0"
                      value={editingProduct.price_per_sq_cm_cents}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, price_per_sq_cm_cents: Number(e.target.value) })
                      }
                      className="mt-1"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="gst-rate" className="text-xs font-semibold text-neutral-700">
                        GST rate (%)
                      </Label>
                      <select
                        id="gst-rate"
                        value={editingProduct.gst_rate ?? 18}
                        onChange={(e) => setEditingProduct({ ...editingProduct, gst_rate: Number(e.target.value) })}
                        className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {[0, 5, 12, 18, 28].map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="hsn-code" className="text-xs font-semibold text-neutral-700">
                        HSN code
                      </Label>
                      <Input
                        id="hsn-code"
                        value={editingProduct.hsn_code ?? ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, hsn_code: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                        inputMode="numeric"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-neutral-700 block mb-2">
                      Volume Discount Tiers (PRD § 05)
                    </Label>
                    <div className="space-y-2">
                      {(editingProduct.pricing_tiers || []).map((t: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500 w-16">Min Qty:</span>
                          <Input
                            type="number"
                            min="1"
                            value={t.min_quantity}
                            onChange={(e) => {
                              const updated = [...editingProduct.pricing_tiers];
                              updated[idx].min_quantity = Number(e.target.value);
                              setEditingProduct({ ...editingProduct, pricing_tiers: updated });
                            }}
                            className="h-8 text-xs w-24"
                          />
                          <span className="text-xs text-neutral-500 w-16">Discount %:</span>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={t.discount_percentage}
                            onChange={(e) => {
                              const updated = [...editingProduct.pricing_tiers];
                              updated[idx].discount_percentage = Number(e.target.value);
                              setEditingProduct({ ...editingProduct, pricing_tiers: updated });
                            }}
                            className="h-8 text-xs w-24"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
                    <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" data-testid="admin-save-product-btn" className="bg-[#FF5A1F] hover:bg-[#E0480F] text-white">
                      Save & Apply Live
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: REPORTS & ANALYTICS (PRD § 11 Capability 05) */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          <Card className="border-neutral-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Business Analytics & Aggregates</CardTitle>
                  <CardDescription className="text-xs">
                    Revenue computed strictly from confirmed payments (&apos;paid&apos;). Pending and cancelled orders are excluded.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                  <span className="text-xs text-neutral-400">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                  <Button size="sm" onClick={() => fetchReports()} variant="outline" className="h-8 px-2 text-xs">
                    Filter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isReportsLoading ? (
                <div className="py-8 text-center text-neutral-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FF5A1F]" />
                  Aggregating SQL data...
                </div>
              ) : reportsData ? (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                      <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                        Confirmed Revenue
                      </div>
                      <div className="text-2xl font-bold text-emerald-900 mt-1" data-testid="admin-reports-revenue">
                        {reportsData.confirmedRevenueFormatted}
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        {reportsData.paidCount} confirmed orders
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl">
                      <div className="text-xs font-semibold text-blue-800 uppercase tracking-wider">
                        Total Orders
                      </div>
                      <div className="text-2xl font-bold text-blue-900 mt-1" data-testid="admin-reports-orders-count">
                        {reportsData.totalOrders}
                      </div>
                      <div className="text-[11px] text-blue-700 mt-0.5">
                        {reportsData.pendingCount} pending / {reportsData.cancelledCount} cancelled
                      </div>
                    </div>

                    <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl">
                      <div className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
                        Active Production
                      </div>
                      <div className="text-2xl font-bold text-purple-900 mt-1">
                        {reportsData.stageCounts?.PRODUCTION || 0}
                      </div>
                      <div className="text-[11px] text-purple-700 mt-0.5">
                        In manufacturing queue
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl">
                      <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                        Completed Jobs
                      </div>
                      <div className="text-2xl font-bold text-amber-900 mt-1">
                        {reportsData.stageCounts?.COMPLETED || 0}
                      </div>
                      <div className="text-[11px] text-amber-700 mt-0.5">
                        Dispatched & archived
                      </div>
                    </div>
                  </div>

                  {/* Throughput by Division Table */}
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 mb-3">
                      Throughput & Volume by Manufacturing Division
                    </h4>
                    <div className="border border-neutral-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-600 border-b border-neutral-200">
                          <tr>
                            <th className="py-2.5 px-4">Division</th>
                            <th className="py-2.5 px-4 text-center">Jobs Placed</th>
                            <th className="py-2.5 px-4 text-center">Total Quantity</th>
                            <th className="py-2.5 px-4 text-right">Confirmed Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {Object.entries(reportsData.divisionThroughput || {}).map(([divSlug, metrics]: any) => (
                            <tr key={divSlug} className="hover:bg-neutral-50/50">
                              <td className="py-2.5 px-4 font-medium text-neutral-800 capitalize">
                                {divSlug.replace(/-/g, " ")}
                              </td>
                              <td className="py-2.5 px-4 text-center text-neutral-600">{metrics.count}</td>
                              <td className="py-2.5 px-4 text-center font-semibold text-neutral-800">
                                {metrics.totalQuantity} units
                              </td>
                              <td className="py-2.5 px-4 text-right font-semibold text-neutral-900">
                                {formatINR(metrics.revenueCents)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: ARCHIVE VIEW (PRD § 11 Capability 04) */}
      {activeTab === "archive" && (
        <Card className="border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Completed Order Archive</CardTitle>
            <CardDescription className="text-xs">
              Completed jobs are moved into this permanent archive. Artwork and print packages remain fully retrievable for reorders and repeats.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isArchiveLoading ? (
              <div className="py-8 text-center text-neutral-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FF5A1F]" />
                Loading archive...
              </div>
            ) : archiveOrders.length === 0 ? (
              <div className="py-8 text-center text-neutral-500">No completed orders archived yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-600 border-b border-neutral-200">
                    <tr>
                      <th className="py-3 px-4">Order / Customer</th>
                      <th className="py-3 px-4">Completed Date</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-center">Print Package</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {archiveOrders.map((ord) => (
                      <tr key={ord.order_number} className="hover:bg-neutral-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-neutral-900">{ord.order_number}</div>
                          <div className="text-xs text-neutral-500">{ord.customer_name || ord.customer_email}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-neutral-600">
                          {new Date(ord.updated_at || ord.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-neutral-900">
                          {formatINR(ord.total_cents)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadProduction(ord)}
                            className="h-7 text-xs"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Retrieve Files
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ORDER DETAIL MODAL (PRD § 11 Capability 02) */}
      {selectedOrderDetail && (
        <div
          data-testid="admin-order-detail-modal"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#FF5A1F]">
                  Order Record
                </span>
                <h3 className="text-xl font-extrabold text-neutral-900">
                  {selectedOrderDetail.order_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderDetail(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 mt-4 text-sm">
              {/* Customer & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-neutral-50 rounded-lg">
                <div>
                  <div className="text-xs font-semibold text-neutral-500">Customer</div>
                  <div className="font-semibold text-neutral-900">{selectedOrderDetail.customer_name || "N/A"}</div>
                  <div className="text-xs text-neutral-600">{selectedOrderDetail.customer_email}</div>
                  <div className="text-[11px] text-neutral-400 font-mono mt-0.5">ID: {selectedOrderDetail.customer_id}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-500">Immutable Destination Snapshot</div>
                  <div className="text-xs text-neutral-800 font-medium">
                    {selectedOrderDetail.shipping_address?.name}
                  </div>
                  <div className="text-xs text-neutral-600">
                    {selectedOrderDetail.shipping_address?.line1}
                  </div>
                  <div className="text-xs text-neutral-600">
                    {selectedOrderDetail.shipping_address?.city}, {selectedOrderDetail.shipping_address?.postal_code}
                  </div>
                  <div className="text-xs text-neutral-500">{selectedOrderDetail.shipping_address?.country}</div>
                </div>
              </div>

              {/* Status & Pricing */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 border border-neutral-200 rounded-lg">
                  <div className="text-[11px] text-neutral-500">Pipeline Stage</div>
                  <div className="font-bold text-neutral-900 mt-0.5">{selectedOrderDetail.pipeline_stage}</div>
                </div>
                <div className="p-2.5 border border-neutral-200 rounded-lg">
                  <div className="text-[11px] text-neutral-500">Payment Status</div>
                  <div className="font-bold text-neutral-900 capitalize mt-0.5">{selectedOrderDetail.payment_status}</div>
                </div>
                <div className="p-2.5 border border-neutral-200 rounded-lg">
                  <div className="text-[11px] text-neutral-500">Net / GST</div>
                  <div className="font-bold text-neutral-900 mt-0.5">
                    {formatINR(selectedOrderDetail.subtotal_cents)} / {formatINR(selectedOrderDetail.tax_cents)}
                  </div>
                </div>
                <div className="p-2.5 border border-neutral-200 rounded-lg bg-neutral-50">
                  <div className="text-[11px] text-neutral-500">Total Gross</div>
                  <div className="font-bold text-neutral-900 mt-0.5">
                    {formatINR(selectedOrderDetail.total_cents)}
                  </div>
                </div>
              </div>

              {/* Proof Approval Log */}
              <div className="p-3 border border-neutral-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-xs text-neutral-700">Proof Approval Gate Status</span>
                  <Badge className={selectedOrderDetail.isReadyForProduction ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                    {selectedOrderDetail.isReadyForProduction ? "Ready for Production" : selectedOrderDetail.notReadyReason || "Locked"}
                  </Badge>
                </div>
                <div className="text-xs text-neutral-600">
                  Version: <span className="font-semibold">v{selectedOrderDetail.proof_version || selectedOrderDetail.approved_proof_version || 1}</span>
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Approved by: {selectedOrderDetail.customer_email || "Customer"} · Locked against unapproved manufacturing
                </div>
              </div>

              {/* Status History (PRD § 11) */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-600 mb-2">
                  Pipeline Transition History
                </h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {(selectedOrderDetail.status_history || []).map((h: any, i: number) => (
                    <div key={i} className="text-xs flex items-center justify-between p-2 bg-neutral-50 rounded border border-neutral-200">
                      <div>
                        <span className="font-medium text-neutral-800">{h.from} → {h.to}</span>
                        {h.notes && <span className="text-neutral-500 ml-2">({h.notes})</span>}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} by {h.changed_by}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-200 flex justify-end">
              <Button variant="outline" onClick={() => setSelectedOrderDetail(null)}>
                Close Record
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
