"use client";

import React, { useState } from "react";
import { Product } from "@/types/database";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileCheck, AlertTriangle } from "lucide-react";
import { precheckArtwork } from "@/modules/designer/artwork-validation";

interface DirectUploadViewProps {
  product: Product;
  widthMm: number;
  heightMm: number;
  /** Returns the draft id to attach the upload to, creating the draft if needed. */
  ensureDraftId: () => Promise<string>;
  onUploadSuccess: (result: { path: string; fileName: string; warnings: string[] }) => void;
}

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string }
  | { phase: "done"; fileName: string; sizeLabel: string; warnings: string[]; dpi?: number }
  | { phase: "error"; message: string };

/**
 * Upload path for finished artwork (PRD § 06). The browser sends the file straight
 * to private storage with a one-time signed URL; the server then inspects the
 * stored file (type by content, resolution, unsafe SVG content) before accepting it.
 */
export function DirectUploadView({ product, widthMm, heightMm, ensureDraftId, onUploadSuccess }: DirectUploadViewProps) {
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const problem = precheckArtwork(file.name, file.size);
    if (problem) {
      setState({ phase: "error", message: problem });
      return;
    }

    setState({ phase: "uploading", fileName: file.name });
    try {
      const draftId = await ensureDraftId();

      const ticketRes = await fetch(`/api/drafts/${draftId}/artwork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      const ticket = await ticketRes.json();
      if (!ticketRes.ok) throw new Error(ticket.error || "Could not start the upload.");

      const putRes = await fetch(ticket.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
        body: file,
      });
      if (!putRes.ok) throw new Error("The file could not be uploaded. Please try again.");

      const confirmRes = await fetch(`/api/drafts/${draftId}/artwork`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ticket.path, fileName: file.name }),
      });
      const confirmed = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmed.error || "The file failed pre-flight checks.");

      setState({
        phase: "done",
        fileName: file.name,
        sizeLabel: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        warnings: confirmed.warnings ?? [],
        dpi: confirmed.effectiveDpi,
      });
      onUploadSuccess({ path: ticket.path, fileName: file.name, warnings: confirmed.warnings ?? [] });
    } catch (err: unknown) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  };

  return (
    <Card className="border-border shadow-elevation">
      <CardHeader>
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-brand-500 uppercase">
          <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Direct Artwork File Upload</span>
        </div>
        <CardTitle className="text-xl font-bold font-heading">Upload Finished Print-Ready Artwork</CardTitle>
        <CardDescription>
          Already have artwork from Illustrator, Photoshop or InDesign? Upload it for a {widthMm}mm × {heightMm}mm print.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <label className="border-2 border-dashed border-border hover:border-brand-500 focus-within:border-brand-500 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-secondary/20 hover:bg-secondary/40">
          <UploadCloud className="w-12 h-12 text-brand-500 mb-3" aria-hidden="true" />
          <span className="font-bold text-sm text-foreground">Choose an artwork file</span>
          <span className="text-xs text-muted-foreground mt-1 font-mono">PDF, SVG, AI, EPS or PNG · up to 50 MB · PNG at 300 DPI recommended</span>
          <input
            type="file"
            accept=".pdf,.svg,.ai,.png,.eps"
            onChange={handleFileUpload}
            disabled={state.phase === "uploading"}
            className="sr-only"
            data-testid="artwork-file-input"
          />
        </label>

        {state.phase === "uploading" && (
          <div role="status" className="text-center font-mono text-xs text-brand-500 animate-pulse">
            Uploading {state.fileName} and running pre-flight checks…
          </div>
        )}

        {state.phase === "error" && (
          <div role="alert" className="p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-300 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        )}

        {state.phase === "done" && (
          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 space-y-3" data-testid="upload-success">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <div>
                  <div className="font-bold text-sm text-foreground">{state.fileName}</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {state.sizeLabel} · Pre-flight passed{state.dpi ? ` · ~${state.dpi} DPI` : ""}
                  </div>
                </div>
              </div>
              <Badge variant="success" className="text-xs font-mono">READY FOR PROOF</Badge>
            </div>
            {state.warnings.length > 0 && (
              <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 border-t border-emerald-200/60 pt-2">
                {state.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="p-4 rounded-lg bg-secondary/50 border text-xs font-mono space-y-2">
          <div className="font-bold text-foreground">Artwork guidelines</div>
          <ul className="text-muted-foreground space-y-1">
            <li>• Include {product.default_bleed_mm}mm bleed on every edge and keep text inside the safe area.</li>
            <li>• Convert fonts to outlines / curves.</li>
            <li>• Use CMYK colour with an embedded profile where possible.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
