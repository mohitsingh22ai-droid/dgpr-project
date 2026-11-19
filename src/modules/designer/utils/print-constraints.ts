import { fitText, approximateMeasure, MeasureFn } from "@/modules/print-engine/text-fit";
import { PrintDimensions, PrintBoundsInPixels } from "../types";

/**
 * Calculates pixel dimensions for Bleed, Trim, and Safety margins
 * based on the physical millimeter specs and available container size.
 */
export function calculatePrintBounds(
  dims: PrintDimensions,
  containerWidth: number = 700,
  containerHeight: number = 550
): PrintBoundsInPixels {
  const totalWidthMm = dims.widthMm + dims.bleedMm * 2;
  const totalHeightMm = dims.heightMm + dims.bleedMm * 2;

  // Leave padding around the canvas for crop marks and ruler
  const padding = 50;
  const availableW = Math.max(200, containerWidth - padding * 2);
  const availableH = Math.max(200, containerHeight - padding * 2);

  const scaleX = availableW / totalWidthMm;
  const scaleY = availableH / totalHeightMm;
  const scaleFactor = Math.min(scaleX, scaleY); // uniform scale (px per mm)

  const bleedWidth = totalWidthMm * scaleFactor;
  const bleedHeight = totalHeightMm * scaleFactor;

  const trimWidth = dims.widthMm * scaleFactor;
  const trimHeight = dims.heightMm * scaleFactor;
  const trimOffsetX = dims.bleedMm * scaleFactor;
  const trimOffsetY = dims.bleedMm * scaleFactor;

  const safeWidth = Math.max(10, (dims.widthMm - dims.safetyMarginMm * 2) * scaleFactor);
  const safeHeight = Math.max(10, (dims.heightMm - dims.safetyMarginMm * 2) * scaleFactor);
  const safeOffsetX = (dims.bleedMm + dims.safetyMarginMm) * scaleFactor;
  const safeOffsetY = (dims.bleedMm + dims.safetyMarginMm) * scaleFactor;

  return {
    bleedWidth,
    bleedHeight,
    trimWidth,
    trimHeight,
    safeWidth,
    safeHeight,
    trimOffsetX,
    trimOffsetY,
    safeOffsetX,
    safeOffsetY,
    scaleFactor,
  };
}

/**
 * Enforces § 04 Placeholder fitting rules:
 * Shrink-to-fit and font size clamping so text never overflows safe printable area.
 */
export function computeFittedFontSize(
  text: string,
  targetWidth: number,
  baseFontSize: number = 24,
  minFontSize: number = 10,
  maxFontSize: number = 72,
  measure: MeasureFn = approximateMeasure
): number {
  if (!text || targetWidth <= 0) return Math.min(maxFontSize, Math.max(minFontSize, baseFontSize));
  // Never grow past the requested size; shrink (down to minFontSize) only when needed.
  return fitText(text, { maxWidth: targetWidth, minFontSize, maxFontSize: Math.min(baseFontSize, maxFontSize) }, measure).fontSize;
}

/**
 * Checks whether an element's bounding box violates the Safety Zone (§ 06).
 */
export function checkSafetyViolation(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: PrintBoundsInPixels
): boolean {
  const isOutsideLeft = x < bounds.safeOffsetX;
  const isOutsideRight = x + width > bounds.safeOffsetX + bounds.safeWidth;
  const isOutsideTop = y < bounds.safeOffsetY;
  const isOutsideBottom = y + height > bounds.safeOffsetY + bounds.safeHeight;

  return isOutsideLeft || isOutsideRight || isOutsideTop || isOutsideBottom;
}
