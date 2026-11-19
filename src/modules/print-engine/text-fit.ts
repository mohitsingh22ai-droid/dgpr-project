/**
 * Per-placeholder text fitting (PRD § 04 / § 07): shrink-to-fit, horizontal
 * tracking and min/max font size, so variable content always fits its box.
 *
 * Pure and renderer-agnostic: callers pass a `measure(text, fontSize)` function
 * (canvas measureText in the browser, the embedded font's metrics on the server),
 * so the designer preview and the print file use the same algorithm.
 */

export interface FitRules {
  /** Box width the text must fit in (same unit as `measure`). */
  maxWidth: number;
  minFontSize: number;
  maxFontSize: number;
  /** Preferred letter spacing as a fraction of the font size (e.g. 0.02). */
  tracking?: number;
  /** Tightest letter spacing allowed before giving up (may be negative, e.g. -0.05). */
  minTracking?: number;
}

export interface FitResult {
  fontSize: number;
  /** Letter spacing in absolute units (fraction × fontSize). */
  letterSpacing: number;
  width: number;
  fits: boolean;
}

export type MeasureFn = (text: string, fontSize: number) => number;

function widthWithTracking(text: string, fontSize: number, trackingFraction: number, measure: MeasureFn): number {
  const gaps = Math.max(0, [...text].length - 1);
  return measure(text, fontSize) + gaps * trackingFraction * fontSize;
}

/**
 * 1. Use the largest size ≤ maxFontSize that fits with the preferred tracking.
 * 2. If even minFontSize does not fit, tighten tracking towards minTracking.
 * 3. If it still does not fit, return minFontSize/minTracking with fits=false so
 *    the caller can flag the row for review instead of printing overflowing text.
 */
export function fitText(text: string, rules: FitRules, measure: MeasureFn): FitResult {
  const tracking = rules.tracking ?? 0;
  const minTracking = Math.min(rules.minTracking ?? tracking, tracking);
  const maxSize = Math.max(rules.minFontSize, rules.maxFontSize);

  if (!text) {
    return { fontSize: maxSize, letterSpacing: tracking * maxSize, width: 0, fits: true };
  }

  // Binary search the font size in 0.25-unit steps.
  let lo = rules.minFontSize;
  let hi = maxSize;
  if (widthWithTracking(text, hi, tracking, measure) <= rules.maxWidth) {
    return { fontSize: hi, letterSpacing: tracking * hi, width: widthWithTracking(text, hi, tracking, measure), fits: true };
  }
  if (widthWithTracking(text, lo, tracking, measure) <= rules.maxWidth) {
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2;
      if (widthWithTracking(text, mid, tracking, measure) <= rules.maxWidth) lo = mid;
      else hi = mid;
    }
    const size = Math.floor(lo * 4) / 4;
    return { fontSize: size, letterSpacing: tracking * size, width: widthWithTracking(text, size, tracking, measure), fits: true };
  }

  // Minimum size reached: tighten tracking.
  const size = rules.minFontSize;
  for (let t = tracking; t >= minTracking - 1e-9; t -= 0.005) {
    const width = widthWithTracking(text, size, t, measure);
    if (width <= rules.maxWidth) return { fontSize: size, letterSpacing: t * size, width, fits: true };
  }
  return {
    fontSize: size,
    letterSpacing: minTracking * size,
    width: widthWithTracking(text, size, minTracking, measure),
    fits: false,
  };
}

/** Rough sans-serif metrics for environments without a font (0.56 × size per glyph). */
export const approximateMeasure: MeasureFn = (text, fontSize) => [...text].length * fontSize * 0.56;
