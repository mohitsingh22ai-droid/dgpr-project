"use client";

import React, { useState } from "react";
import { ProofRecord } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";

interface ProofReviewDialogProps {
  proof: ProofRecord;
  customerEmail: string;
  onApprove: (proofId: string, approvedBy: string) => void;
  onRequestChanges: (proofId: string, feedback: string) => void;
  onClose: () => void;
}

export function ProofReviewDialog({
  proof,
  customerEmail,
  onApprove,
  onRequestChanges,
  onClose,
}: ProofReviewDialogProps) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<"inspect" | "revise">("inspect");

  const handleApprove = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      onApprove(proof.id, customerEmail);
      setIsSubmitting(false);
      onClose();
    }, 600);
  };

  const handleRequestRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      onRequestChanges(proof.id, feedback.trim());
      setIsSubmitting(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-card border max-w-3xl w-full rounded-2xl shadow-elevation overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b flex items-center justify-between bg-industrial-950 text-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-600 text-xs font-medium">
                Digital Proofing
              </span>
              <span className="text-xs font-mono text-industrial-400">
                REVISION v{proof.version}
              </span>
            </div>
            <h2 className="text-xl font-bold font-heading mt-1">
              Production Artwork Inspection & Approval
            </h2>
          </div>

          <button
            onClick={onClose}
            className="text-industrial-400 hover:text-white font-mono text-sm p-1"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Watermarked Artwork Preview */}
          <div className="relative rounded-xl overflow-hidden border bg-industrial-950 flex justify-center items-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proof.previewUrl}
              alt="Proof Inspection"
              className="max-h-72 object-contain rounded shadow"
            />

            {/* Repeating Diagonal Watermark (§ 08) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-white/20 text-3xl font-mono font-extrabold uppercase tracking-widest rotate-[-20deg]">
                W2P PROOF · v{proof.version}
              </span>
            </div>

            <div className="absolute top-3 left-3 flex gap-2">
              <Badge variant="industrial" className="text-xs">
                v{proof.version} INSPECTION
              </Badge>
              {proof.status === "approved" ? (
                <Badge variant="success" className="text-xs">
                  APPROVED FOR MANUFACTURE
                </Badge>
              ) : proof.status === "changes_requested" ? (
                <Badge variant="destructive" className="text-xs">
                  REVISION PENDING
                </Badge>
              ) : (
                <Badge variant="warning" className="text-xs animate-pulse">
                  AWAITING APPROVAL
                </Badge>
              )}
            </div>
          </div>

          {/* Technical Specifications Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-secondary/50 border text-xs font-mono">
            <div>
              <span className="text-muted-foreground block text-[10px]">FINISHED TRIM</span>
              <span className="font-bold text-foreground">
                {proof.metadata.widthMm}mm × {proof.metadata.heightMm}mm
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">BLEED OVERPRINT</span>
              <span className="font-bold text-red-500">+{proof.metadata.bleedMm}mm</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">SUBSTRATE</span>
              <span className="font-bold text-foreground truncate block">
                {proof.metadata.materialName}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">APPROVAL GATE</span>
              <span className={proof.status === "approved" ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                {proof.status === "approved" ? "UNLOCKED (300 DPI)" : "LOCKED"}
              </span>
            </div>
          </div>

          {/* Revision Form / Feedback Mode */}
          {viewMode === "revise" ? (
            <form onSubmit={handleRequestRevision} className="space-y-4 p-4 rounded-xl border border-destructive/30 bg-destructive/5 animate-in fade-in">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-destructive">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Request Artwork Revisions</span>
                </div>
                <Label htmlFor="rev-notes" className="text-xs text-muted-foreground">
                  Specify required adjustments for the pre-press operator (text shifts, color tweaks, font size):
                </Label>
                <textarea
                  id="rev-notes"
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. Please align the event sponsor logo 3mm to the right and make the category font bold."
                  className="w-full text-xs font-mono p-3 rounded-md border bg-background text-foreground focus:ring-1 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("inspect")}
                  className="text-xs font-mono"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !feedback.trim()}
                  className="text-xs font-semibold bg-destructive hover:bg-destructive/90 text-white"
                >
                  Submit Change Request (Logs v{proof.version + 1})
                </Button>
              </div>
            </form>
          ) : (
            proof.customerFeedback && (
              <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-xs font-mono text-amber-800 dark:text-amber-300">
                <span className="font-bold block">Previous Customer Feedback:</span>
                &ldquo;{proof.customerFeedback}&rdquo;
              </div>
            )
          )}

          {/* Audit Log Stamp (§ 08) */}
          {proof.status === "approved" && proof.approvedAt && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 text-xs font-mono text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <div>
                <span className="font-bold block flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Formal Customer Sign-Off Verified
                </span>
                <span className="text-[11px] opacity-80">
                  Approved By: {proof.approvedBy} on {new Date(proof.approvedAt).toLocaleString("en-IN")}
                </span>
              </div>
              <Badge variant="success" className="text-[10px]">
                PRODUCTION READY
              </Badge>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-6 bg-secondary/30 border-t flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-mono"
          >
            Close Viewer
          </Button>

          {proof.status !== "approved" && viewMode === "inspect" && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode("revise")}
                className="text-xs font-mono text-destructive hover:bg-destructive/10 hover:border-destructive/40"
              >
                Request Changes
              </Button>

              <Button
                size="sm"
                disabled={isSubmitting}
                onClick={handleApprove}
                className="font-semibold text-xs shadow-glow bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Approve Proof v{proof.version} & Unlock Files
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
