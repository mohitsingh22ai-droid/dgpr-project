"use client";

import { VariableDataAttach } from "@/modules/variable-data/components/variable-data-attach";
import React, { useState, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Product } from "@/types/database";
import {
  CanvasElement,
  PrintDimensions,
  SerializedCanvasState,
  TextCanvasElement,
  ShapeCanvasElement,
  ImageCanvasElement,
} from "../types";
import { calculatePrintBounds, computeFittedFontSize } from "../utils/print-constraints";
import { DesignerToolbar } from "./designer-toolbar";
import { DirectUploadView } from "./direct-upload-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sparkles,
  Save,
  UploadCloud,
  Palette,
  Eye,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import Konva from "konva";

// Dynamic client-only import for Konva Stage to prevent SSR window issues
const CanvasStageDynamic = dynamic(
  () => import("./canvas-stage").then((mod) => mod.CanvasStage),
  { ssr: false }
);

interface DesignerPageViewProps {
  product: Product;
  draftId?: string;
  /** Saved design state of an existing draft (reopened job or reorder). */
  initialDesign?: Record<string, unknown> | null;
  initialWidthMm: number;
  initialHeightMm: number;
  selectedMaterialId: string;
  quantity: number;
}

export function DesignerPageView({
  product,
  draftId,
  initialDesign,
  initialWidthMm,
  initialHeightMm,
  selectedMaterialId,
  quantity,
}: DesignerPageViewProps) {
  const router = useRouter();
  const [effectiveDraftId, setEffectiveDraftId] = useState<string>(draftId || "");
  const [currentProofVersion, setCurrentProofVersion] = useState<number>(1);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const savedCanvas = initialDesign && Array.isArray((initialDesign as { elements?: unknown }).elements)
    ? (initialDesign as unknown as SerializedCanvasState)
    : null;
  const [mode, setMode] = useState<"designer" | "upload">(
    initialDesign && (initialDesign as { source?: string }).source === "upload" ? "upload" : "designer"
  );
  const stageRef = useRef<Konva.Stage | null>(null);

  const [dimensions] = useState<PrintDimensions>({
    widthMm: initialWidthMm,
    heightMm: initialHeightMm,
    bleedMm: product.default_bleed_mm,
    safetyMarginMm: product.default_safety_margin_mm,
  });

  const [backgroundColor, setBackgroundColor] = useState<string>(savedCanvas?.backgroundColor ?? "#FFFFFF");
  const [showBleedGuide, setShowBleedGuide] = useState<boolean>(true);
  const [showTrimGuide, setShowTrimGuide] = useState<boolean>(true);
  const [showSafeGuide, setShowSafeGuide] = useState<boolean>(true);
  // Issue 2: Editor-only "Show guides" toggle (default on) (§ 06, § 08)
  const [showGuides, setShowGuides] = useState<boolean>(true);

  // Initial Sample Elements
  const [elements, setElements] = useState<CanvasElement[]>(savedCanvas?.elements ?? [
    {
      id: "el-brand-title",
      type: "text",
      x: 50,
      y: 60,
      text: product.name.toUpperCase(),
      fontSize: 22,
      fontFamily: "Plus Jakarta Sans",
      fill: "#111318",
      align: "left",
      isBold: true,
      rotation: 0,
      opacity: 1,
    },
    {
      id: "el-brand-subtitle",
      type: "text",
      x: 50,
      y: 100,
      text: "CUSTOM MANUFACTURING SPEC",
      fontSize: 12,
      fontFamily: "JetBrains Mono",
      fill: "#FF5A1F",
      align: "left",
      isBold: true,
      rotation: 0,
      opacity: 1,
    },
  ]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState<boolean>(false);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [savedJsonNotice, setSavedJsonNotice] = useState<string | null>(null);

  // Compute print pixel bounds
  const bounds = useMemo(() => {
    return calculatePrintBounds(dimensions, 700, 520);
  }, [dimensions]);

  // Add Text with Placeholder Fitting Rules (§ 04)
  const handleAddText = (type: "heading" | "body") => {
    const isHeading = type === "heading";
    const sampleText = isHeading ? "SAMPLE HEADING" : "High endurance specification line";
    const baseSize = isHeading ? 26 : 14;

    // Apply shrink-to-fit calculation if text exceeds available safe width (§ 04)
    const fittedSize = computeFittedFontSize(sampleText, bounds.safeWidth, baseSize, 10, 48);

    const newElement: TextCanvasElement = {
      id: `text-${Date.now()}`,
      type: "text",
      x: bounds.safeOffsetX + 20,
      y: bounds.safeOffsetY + (elements.length * 30) % 200 + 20,
      text: sampleText,
      fontSize: fittedSize,
      fontFamily: isHeading ? "Plus Jakarta Sans" : "JetBrains Mono",
      fill: isHeading ? "#111318" : "#444D5F",
      align: "left",
      isBold: isHeading,
      rotation: 0,
      opacity: 1,
      autoShrink: true,
    };

    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  // Add Shape
  const handleAddShape = () => {
    const newShape: ShapeCanvasElement = {
      id: `shape-${Date.now()}`,
      type: "rect",
      x: bounds.safeOffsetX + 30,
      y: bounds.safeOffsetY + 40,
      width: 140,
      height: 60,
      fill: "#FF5A1F",
      cornerRadius: 6,
      rotation: 0,
      opacity: 0.9,
    };
    setElements([...elements, newShape]);
    setSelectedId(newShape.id);
  };

  // Upload Logo Image
  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        const newImg: ImageCanvasElement = {
          id: `img-${Date.now()}`,
          type: "image",
          src: ev.target.result,
          x: bounds.safeOffsetX + 40,
          y: bounds.safeOffsetY + 40,
          width: 120,
          height: 120,
          rotation: 0,
          opacity: 1,
        };
        setElements([...elements, newImg]);
        setSelectedId(newImg.id);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateSelected = (attrs: Partial<CanvasElement>) => {
    if (!selectedId) return;
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== selectedId) return el;
        // If updating text, enforce placeholder shrink-to-fit
        const textAttrs = attrs as Partial<TextCanvasElement>;
        if (el.type === "text" && textAttrs.text !== undefined) {
          const fitted = computeFittedFontSize(textAttrs.text, bounds.safeWidth, (el as TextCanvasElement).fontSize);
          return { ...el, ...attrs, fontSize: fitted } as CanvasElement;
        }
        return { ...el, ...attrs } as CanvasElement;
      })
    );
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  // Serialize Canvas State to JSON (§ 06: Saved designs)
  const serializeCanvasState = (): SerializedCanvasState => {
    return {
      version: "1.0",
      timestamp: new Date().toISOString(),
      productSlug: product.slug,
      dimensionsMm: dimensions,
      pxPerMm: bounds.scaleFactor,
      backgroundColor,
      elements,
    };
  };

  // Saves the design to the customer's account (PRD § 09 saved designs).
  const handleSaveDesign = async () => {
    // The server decides whether the visitor is signed in (the client auth state may still be loading).
    try {
    const res = await fetch("/api/designs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        name: `${product.name} · ${new Date().toLocaleDateString("en-IN")}`,
        widthMm: dimensions.widthMm,
        heightMm: dimensions.heightMm,
        material: selectedMaterialId,
        canvasState: serializeCanvasState(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavedJsonNotice(
      res.ok
        ? "Design saved to your account."
        : res.status === 401
          ? "Sign in to save designs to your account."
          : `Could not save the design: ${data.error || res.status}`
    );
    } catch {
      setSavedJsonNotice("Could not save the design: network error. Please try again.");
    }
    setTimeout(() => setSavedJsonNotice(null), 6000);
  };

  // Creates the job draft the first time it is needed (no draft is created just by viewing).
  const ensureDraftId = async (): Promise<string> => {
    if (effectiveDraftId) return effectiveDraftId;
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        widthMm: dimensions.widthMm,
        heightMm: dimensions.heightMm,
        materialId: selectedMaterialId,
        quantity,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start the job.");
    setEffectiveDraftId(data.draft.id);
    window.history.replaceState(null, "", `?draft=${data.draft.id}`);
    return data.draft.id as string;
  };

  // Real-Time Proof Preview Generation (§ 06 & § 08)
  const handleOpenProofModal = async () => {
    let uri: string | null = null;
    if (stageRef.current) {
      const stage = stageRef.current;
      // Issue 2: Guides belong in editor only. Temporarily hide guides layer before capture
      const guidesLayer = stage.findOne(".guides-overlay-layer") || stage.getLayers()[1];
      const wasVisible = guidesLayer ? guidesLayer.visible() : true;
      if (guidesLayer) {
        guidesLayer.visible(false);
        stage.batchDraw();
      }
      try {
        uri = stage.toDataURL({ pixelRatio: 2 });
      } catch (err) {
        console.warn("Stage toDataURL fallback:", err);
      } finally {
        if (guidesLayer && wasVisible) {
          guidesLayer.visible(true);
          stage.batchDraw();
        }
      }
    }
    if (!uri) {
      uri = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='%23ffffff'/><text x='60' y='200' font-family='sans-serif' font-size='22' font-weight='bold' fill='%23111827'>W2P PROOF PREVIEW</text></svg>";
    }
    setProofDataUrl(uri);
    setProofModalOpen(true);

    {
      try {
        const draftIdForProof = await ensureDraftId();
        await fetch(`/api/drafts/${draftIdForProof}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updates: {
              status: "proof_pending",
              ...(mode === "designer" ? { designJson: serializeCanvasState() } : {}),
            },
            action: "PROOF_GENERATED",
          }),
        });
      } catch (e) {
        console.error("Draft update error:", e);
      }
    }
  };

  const handleApproveProof = async () => {
    setIsApproving(true);
    try {
      const targetDraftId = await ensureDraftId();

      // Step 1: Ensure artwork is saved
      await fetch(`/api/drafts/${targetDraftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            status: "proof_pending",
            ...(mode === "designer" ? { designJson: serializeCanvasState() } : {}),
          },
          action: "PROOF_PENDING_BEFORE_APPROVAL",
        }),
      });

      // Step 2: Formal proof approval endpoint (§ 08 & Task 4: POST /api/drafts/[id]/approve-proof)
      const approveRes = await fetch(`/api/drafts/${targetDraftId}/approve-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!approveRes.ok) {
        const errData = await approveRes.json();
        throw new Error(errData.error || "Approval failed");
      }

      setProofModalOpen(false);
      // Navigate to checkout with draft ID ONLY (PRD § 04, § 05)
      router.push(`/checkout?draft=${targetDraftId}`);
    } catch (err: unknown) {
      console.error("Proof approval error:", err);
      alert(err instanceof Error ? err.message : "Failed to approve proof.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (effectiveDraftId) {
      try {
        const res = await fetch(`/api/drafts/${effectiveDraftId}/request-changes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedback: "Customer requested artwork adjustments in designer.",
          }),
        });
        const data = await res.json();
        if (data.draft) {
          setCurrentProofVersion(data.draft.proofVersion);
        }
      } catch (err) {
        console.error("Request changes error:", err);
      }
    }
    setProofModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Specs Bar */}
      <div className="p-6 rounded-2xl bg-industrial-950 text-white border border-industrial-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-600 text-xs font-medium">
              Interactive Studio
            </span>
            <span className="text-xs font-mono text-industrial-400">
              {product.division_slug.toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight mt-1">
            {product.name}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-industrial-300 mt-1">
            <span>Trim Box: <strong className="text-white">{dimensions.widthMm}mm × {dimensions.heightMm}mm</strong></span>
            <span>Bleed: <strong className="text-red-400">+{dimensions.bleedMm}mm</strong></span>
            <span>Safety Margin: <strong className="text-emerald-400">{dimensions.safetyMarginMm}mm</strong></span>
            <span>Batch Quantity: <strong className="text-brand-600">{quantity} units</strong></span>
          </div>
        </div>

        {/* Path Switcher: Designer vs Direct File Upload */}
        <div className="flex items-center gap-2 bg-industrial-900 p-1 rounded-lg border border-industrial-800">
          <Button
            size="sm"
            variant={mode === "designer" ? "default" : "ghost"}
            onClick={() => setMode("designer")}
            className="text-xs font-mono"
          >
            <Palette className="w-3.5 h-3.5 mr-1.5" />
            In-Browser Canvas
          </Button>
          <Button
            size="sm"
            variant={mode === "upload" ? "default" : "ghost"}
            onClick={() => setMode("upload")}
            className="text-xs font-mono"
          >
            <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
            Direct File Upload
          </Button>
        </div>
      </div>

      {savedJsonNotice && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{savedJsonNotice}</span>
        </div>
      )}

      {/* MODE 1: In-Browser Designer */}
      {mode === "designer" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Canvas Work Area (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="p-4 border-border shadow-elevation">
              <div className="flex items-center justify-between pb-3 border-b text-xs font-mono text-muted-foreground">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                  Visual Manufacturing Canvas
                </span>
                <div className="flex items-center gap-3">
                  {/* Issue 2: Editor-only "Show guides" toggle (default on) */}
                  <Button
                    variant={showGuides ? "secondary" : "outline"}
                    size="sm"
                    data-testid="toggle-guides-button"
                    onClick={() => setShowGuides(!showGuides)}
                    className="h-7 text-xs px-2.5 flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3 text-brand-500" />
                    <span>{showGuides ? "Guides ON" : "Guides OFF"}</span>
                  </Button>
                  <span>Scale: {bounds.scaleFactor.toFixed(2)} px/mm</span>
                </div>
              </div>

              {/* The Konva Canvas */}
              <div className="mt-3">
                <CanvasStageDynamic
                  bounds={bounds}
                  elements={elements}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onChange={setElements}
                  showBleedGuide={showBleedGuide}
                  showTrimGuide={showTrimGuide}
                  showSafeGuide={showSafeGuide}
                  showGuides={showGuides}
                  backgroundColor={backgroundColor}
                  stageRef={stageRef}
                />
              </div>

              {/* Canvas Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t mt-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDesign}
                    className="text-xs font-mono"
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    Save to my designs
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleOpenProofModal}
                    className="font-semibold shadow-glow text-xs"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Generate Proof & Preview
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Print Zone Legend (§ 06) */}
            <div className="p-4 rounded-xl border bg-secondary/30 grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <span className="w-3 h-0.5 border-t border-dashed border-red-500" />
                <span>Bleed (+3mm)</span>
              </div>
              <div className="flex items-center gap-1.5 text-foreground font-semibold">
                <span className="w-3 h-0.5 bg-foreground" />
                <span>Trim Line (Cut)</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-3 h-0.5 border-t border-dashed border-emerald-500" />
                <span>Safe Margin (-3mm)</span>
              </div>
            </div>
          </div>

          {/* Designer Controls Sidebar (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <DesignerToolbar
              elements={elements}
              selectedId={selectedId}
              onAddText={handleAddText}
              onAddShape={handleAddShape}
              onUploadImage={handleUploadLogo}
              onUpdateSelected={handleUpdateSelected}
              onDeleteSelected={handleDeleteSelected}
              showBleedGuide={showBleedGuide}
              setShowBleedGuide={setShowBleedGuide}
              showTrimGuide={showTrimGuide}
              setShowTrimGuide={setShowTrimGuide}
              showSafeGuide={showSafeGuide}
              setShowSafeGuide={setShowSafeGuide}
              backgroundColor={backgroundColor}
              setBackgroundColor={setBackgroundColor}
            />
          </div>
        </div>
      ) : (
        /* MODE 2: Direct File Upload Path (§ 06 & § 08) */
        <div className="max-w-2xl mx-auto">
          <DirectUploadView
            product={product}
            widthMm={dimensions.widthMm}
            heightMm={dimensions.heightMm}
            ensureDraftId={ensureDraftId}
            onUploadSuccess={() => {
              handleOpenProofModal();
            }}
          />
        </div>
      )}

      {product.has_variable_data && (
        <div className="max-w-2xl">
          <VariableDataAttach
            quantity={quantity}
            sampleHeaders={product.variable_data_sample_headers}
            ensureDraftId={ensureDraftId}
          />
        </div>
      )}

      {/* REAL-TIME PROOF PREVIEW MODAL (§ 06 & § 08) */}
      {proofModalOpen && proofDataUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-card border max-w-2xl w-full rounded-2xl shadow-elevation overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b flex items-center justify-between shrink-0">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-600 text-xs font-medium">
                  Digital Proof Inspection
                </span>
                <h3 className="text-lg sm:text-xl font-bold font-heading mt-1">
                  Digital Proof Approval Inspection
                </h3>
              </div>
              <button
                onClick={() => setProofModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-mono p-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {/* Proof Canvas with Watermark */}
              <div className="relative rounded-xl overflow-hidden border bg-industrial-950 flex justify-center items-center p-3 sm:p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofDataUrl}
                  alt="Proof Preview"
                  className="max-h-56 sm:max-h-80 object-contain rounded shadow"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-white/20 text-2xl sm:text-3xl font-mono font-extrabold uppercase tracking-widest rotate-[-15deg]">
                    W2P PROOF · v{currentProofVersion}
                  </span>
                </div>
              </div>

              <div className="p-3 sm:p-4 rounded-lg bg-secondary/50 border text-xs font-mono space-y-1">
                <div>• Verified Size: {dimensions.widthMm}mm × {dimensions.heightMm}mm</div>
                <div>• High-Res Bleed: +{dimensions.bleedMm}mm included</div>
                <div>• Production Gate: Files unlock immediately upon proof approval</div>
                <div>• Proof Version: v{currentProofVersion} (Pre-Press Asset)</div>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-secondary/30 border-t flex flex-wrap items-center justify-between gap-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestChanges}
                className="text-xs font-mono"
              >
                Adjust Artwork
              </Button>

              <Button
                size="sm"
                onClick={handleApproveProof}
                disabled={isApproving}
                className="font-semibold text-xs shadow-glow bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isApproving ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Recording Approval...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve Proof v{currentProofVersion} & Proceed to Checkout
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
