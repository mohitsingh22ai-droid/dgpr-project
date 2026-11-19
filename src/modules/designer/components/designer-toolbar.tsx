"use client";

import React from "react";
import { CanvasElement, TextCanvasElement, ShapeCanvasElement } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Type,
  Image as ImageIcon,
  Square,
  Trash2,
  Bold,
  Italic,
  Eye,
  EyeOff,
  Layers,
  Palette,
} from "lucide-react";

interface DesignerToolbarProps {
  elements: CanvasElement[];
  selectedId: string | null;
  onAddText: (type: "heading" | "body") => void;
  onAddShape: () => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdateSelected: (attrs: Partial<CanvasElement>) => void;
  onDeleteSelected: () => void;
  showBleedGuide: boolean;
  setShowBleedGuide: (v: boolean) => void;
  showTrimGuide: boolean;
  setShowTrimGuide: (v: boolean) => void;
  showSafeGuide: boolean;
  setShowSafeGuide: (v: boolean) => void;
  backgroundColor: string;
  setBackgroundColor: (color: string) => void;
}

export function DesignerToolbar({
  elements,
  selectedId,
  onAddText,
  onAddShape,
  onUploadImage,
  onUpdateSelected,
  onDeleteSelected,
  showBleedGuide,
  setShowBleedGuide,
  showTrimGuide,
  setShowTrimGuide,
  showSafeGuide,
  setShowSafeGuide,
  backgroundColor,
  setBackgroundColor,
}: DesignerToolbarProps) {
  const selectedElement = elements.find((el) => el.id === selectedId);

  return (
    <div className="space-y-4">
      {/* 1. Quick Add Tools */}
      <div className="p-4 rounded-xl border bg-card shadow-subtle space-y-3">
        <div className="text-xs font-mono font-semibold uppercase text-muted-foreground">
          Artwork Tools
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddText("heading")}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Type className="w-3.5 h-3.5 text-brand-500" />
            + Heading
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddText("body")}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Type className="w-3.5 h-3.5 text-muted-foreground" />
            + Body Text
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onAddShape}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Square className="w-3.5 h-3.5 text-blue-500" />
            + Shape
          </Button>

          {/* Upload Logo/Image */}
          <label className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-semibold border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 cursor-pointer transition-colors">
            <ImageIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
            Upload Logo
            <input
              type="file"
              accept="image/png, image/jpeg, image/svg+xml"
              onChange={onUploadImage}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* 2. Visual Guide Toggles (§ 06 & Testing Checklist) */}
      <div className="p-4 rounded-xl border bg-card shadow-subtle space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold uppercase text-muted-foreground">
            Print Zone Overlays
          </span>
          <Badge variant="outline" className="text-[10px]">
            TOLERANCE CONTROLS
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Bleed Guide (+3mm) */}
          <button
            onClick={() => setShowBleedGuide(!showBleedGuide)}
            className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-all ${
              showBleedGuide
                ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400 font-semibold"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            <div>
              <div className="text-[11px] font-bold">Bleed (+3mm)</div>
              <div className="text-[9px] opacity-80">Outer Overprint</div>
            </div>
            {showBleedGuide ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Trim Guide (Cut Line) */}
          <button
            onClick={() => setShowTrimGuide(!showTrimGuide)}
            className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-all ${
              showTrimGuide
                ? "border-industrial-800 bg-industrial-950 text-white font-semibold"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            <div>
              <div className="text-[11px] font-bold">Trim Line</div>
              <div className="text-[9px] opacity-80">Cut Contour</div>
            </div>
            {showTrimGuide ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Safety Zone (-3mm) */}
          <button
            onClick={() => setShowSafeGuide(!showSafeGuide)}
            className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-all ${
              showSafeGuide
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            <div>
              <div className="text-[11px] font-bold">Safe Zone</div>
              <div className="text-[9px] opacity-80">-3mm Boundary</div>
            </div>
            {showSafeGuide ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 3. Selected Element Inspector */}
      {selectedElement ? (
        <div className="p-4 rounded-xl border bg-card shadow-subtle space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-mono font-bold uppercase text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-500" />
              Selected: {selectedElement.type.toUpperCase()}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDeleteSelected}
              className="h-7 px-2 text-xs"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
          </div>

          {/* Text Controls */}
          {selectedElement.type === "text" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="text-val">Content</Label>
                <Input
                  id="text-val"
                  value={(selectedElement as TextCanvasElement).text}
                  onChange={(e) => onUpdateSelected({ text: e.target.value })}
                  className="font-sans text-sm mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Font Family</Label>
                  <select
                    value={(selectedElement as TextCanvasElement).fontFamily}
                    onChange={(e) => onUpdateSelected({ fontFamily: e.target.value })}
                    className="w-full text-xs font-mono bg-background border rounded h-9 px-2 mt-1"
                  >
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                    <option value="JetBrains Mono">JetBrains Mono</option>
                    <option value="Arial">Arial Industrial</option>
                    <option value="Impact">Impact Bold</option>
                    <option value="Georgia">Georgia Serif</option>
                  </select>
                </div>

                <div>
                  <Label>Font Size (px)</Label>
                  <Input
                    type="number"
                    min="10"
                    max="120"
                    value={(selectedElement as TextCanvasElement).fontSize}
                    onChange={(e) => onUpdateSelected({ fontSize: Number(e.target.value) })}
                    className="font-mono mt-1"
                  />
                </div>
              </div>

              {/* Formatting & Color */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1">
                  <Button
                    variant={(selectedElement as TextCanvasElement).isBold ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      onUpdateSelected({ isBold: !(selectedElement as TextCanvasElement).isBold })
                    }
                    className="h-8 w-8 p-0"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={(selectedElement as TextCanvasElement).isItalic ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      onUpdateSelected({ isItalic: !(selectedElement as TextCanvasElement).isItalic })
                    }
                    className="h-8 w-8 p-0"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-[10px]">Text Color</Label>
                  <input
                    type="color"
                    value={(selectedElement as TextCanvasElement).fill}
                    onChange={(e) => onUpdateSelected({ fill: e.target.value })}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Shape Controls */}
          {selectedElement.type === "rect" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Fill Color</Label>
                <input
                  type="color"
                  value={(selectedElement as ShapeCanvasElement).fill}
                  onChange={(e) => onUpdateSelected({ fill: e.target.value })}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
              </div>

              <div>
                <Label>Corner Radius</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={(selectedElement as ShapeCanvasElement).cornerRadius || 0}
                  onChange={(e) => onUpdateSelected({ cornerRadius: Number(e.target.value) })}
                  className="font-mono mt-1"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-dashed text-center text-xs font-mono text-muted-foreground">
          Click any canvas element to edit text, scale, rotate, or re-color.
        </div>
      )}

      {/* 4. Canvas Background Color */}
      <div className="p-4 rounded-xl border bg-card shadow-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-brand-500" />
          <span className="text-xs font-mono font-semibold">Canvas Background Stock</span>
        </div>
        <div className="flex items-center gap-2">
          {["#FFFFFF", "#111318", "#FF5A1F", "#F59E0B", "#10B981"].map((c) => (
            <button
              key={c}
              onClick={() => setBackgroundColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                backgroundColor === c ? "scale-110 border-brand-500 shadow-sm" : "border-border"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className="w-6 h-6 rounded border cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
