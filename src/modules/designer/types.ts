export type CanvasElementType = "text" | "image" | "rect" | "circle";

export interface BaseCanvasElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  isLocked?: boolean;
}

export interface TextCanvasElement extends BaseCanvasElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  align: "left" | "center" | "right";
  isBold?: boolean;
  isItalic?: boolean;
  maxWidth?: number;
  autoShrink?: boolean; // § 04: shrink-to-fit rule
}

export interface ImageCanvasElement extends BaseCanvasElement {
  type: "image";
  src: string;
  width: number;
  height: number;
}

export interface ShapeCanvasElement extends BaseCanvasElement {
  type: "rect" | "circle";
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
}

export type CanvasElement = TextCanvasElement | ImageCanvasElement | ShapeCanvasElement;

export interface PrintDimensions {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safetyMarginMm: number;
}

export interface PrintBoundsInPixels {
  // Screen pixel dimensions
  bleedWidth: number;
  bleedHeight: number;
  trimWidth: number;
  trimHeight: number;
  safeWidth: number;
  safeHeight: number;
  // Offsets
  trimOffsetX: number;
  trimOffsetY: number;
  safeOffsetX: number;
  safeOffsetY: number;
  scaleFactor: number; // pixels per mm
}

export interface SerializedCanvasState {
  version: "1.0";
  timestamp: string;
  productSlug: string;
  dimensionsMm: PrintDimensions;
  /** Designer stage scale when the design was saved (canvas px per mm, origin = bleed box corner). */
  pxPerMm?: number;
  backgroundColor: string;
  elements: CanvasElement[];
}
