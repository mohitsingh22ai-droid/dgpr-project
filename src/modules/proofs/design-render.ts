import { SerializedCanvasState, CanvasElement } from "@/modules/designer/types";
import { calculatePrintBounds } from "@/modules/designer/utils/print-constraints";

/**
 * Converts a serialized designer canvas into physical units and renders it as SVG.
 *
 * The designer stage's origin is the top-left corner of the BLEED box and its
 * scale is `pxPerMm`. All output geometry is in millimetres, so the same model
 * drives the proof (SVG) and the production file (PDF).
 */

/** Designer stage size used before pxPerMm was stored on saved states. */
const LEGACY_STAGE = { width: 700, height: 520 };

export interface MmElement {
  source: CanvasElement;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizeMm?: number;
}

export function pxPerMm(state: SerializedCanvasState): number {
  const stored = (state as SerializedCanvasState & { pxPerMm?: number }).pxPerMm;
  if (stored && stored > 0) return stored;
  return calculatePrintBounds(state.dimensionsMm, LEGACY_STAGE.width, LEGACY_STAGE.height).scaleFactor;
}

/** Element geometry in mm, relative to the bleed box's top-left corner. */
export function toMillimetres(state: SerializedCanvasState): MmElement[] {
  const scale = pxPerMm(state);
  return state.elements.map((el) => {
    const width = "width" in el ? el.width : 0;
    const height = "height" in el ? el.height : 0;
    return {
      source: el,
      xMm: el.x / scale,
      yMm: el.y / scale,
      widthMm: width / scale,
      heightMm: height / scale,
      fontSizeMm: el.type === "text" ? el.fontSize / scale : undefined,
    };
  });
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$|^[a-z]{3,20}$/i.test(value) ? value : fallback;
}

/** Only embedded raster/SVG images are drawn; remote URLs are never fetched or referenced. */
function safeImageHref(src: string): string | null {
  return /^data:image\/(png|jpe?g|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(src) ? src : null;
}

/**
 * Renders the artwork as an SVG fragment in mm units (no outer <svg>), covering
 * the bleed box [0, 0, width + 2·bleed, height + 2·bleed].
 */
export function renderDesignFragment(state: SerializedCanvasState): string {
  const { widthMm, heightMm, bleedMm } = state.dimensionsMm;
  const parts: string[] = [
    `<rect x="0" y="0" width="${widthMm + 2 * bleedMm}" height="${heightMm + 2 * bleedMm}" fill="${safeColor(state.backgroundColor, "#FFFFFF")}"/>`,
  ];

  for (const el of toMillimetres(state)) {
    const src = el.source;
    const transform = src.rotation ? ` transform="rotate(${src.rotation} ${el.xMm} ${el.yMm})"` : "";
    const opacity = src.opacity !== undefined && src.opacity < 1 ? ` opacity="${Math.max(0, src.opacity)}"` : "";

    if (src.type === "text") {
      const anchor = src.align === "center" ? "middle" : src.align === "right" ? "end" : "start";
      parts.push(
        `<text x="${el.xMm}" y="${el.yMm}" dominant-baseline="hanging" font-family="${escapeXml(src.fontFamily || "Helvetica")}, Helvetica, Arial, sans-serif" font-size="${el.fontSizeMm}" font-weight="${src.isBold ? 700 : 400}" font-style="${src.isItalic ? "italic" : "normal"}" text-anchor="${anchor}" fill="${safeColor(src.fill, "#111111")}"${opacity}${transform}>${escapeXml(src.text)}</text>`
      );
    } else if (src.type === "rect") {
      const radius = src.cornerRadius ? ` rx="${src.cornerRadius / pxPerMm(state)}"` : "";
      parts.push(
        `<rect x="${el.xMm}" y="${el.yMm}" width="${el.widthMm}" height="${el.heightMm}"${radius} fill="${safeColor(src.fill, "#000000")}"${opacity}${transform}/>`
      );
    } else if (src.type === "circle") {
      parts.push(
        `<ellipse cx="${el.xMm + el.widthMm / 2}" cy="${el.yMm + el.heightMm / 2}" rx="${el.widthMm / 2}" ry="${el.heightMm / 2}" fill="${safeColor(src.fill, "#000000")}"${opacity}${transform}/>`
      );
    } else if (src.type === "image") {
      const href = safeImageHref(src.src);
      if (href) {
        parts.push(
          `<image x="${el.xMm}" y="${el.yMm}" width="${el.widthMm}" height="${el.heightMm}" preserveAspectRatio="none" href="${href}"${opacity}${transform}/>`
        );
      }
    }
  }
  return parts.join("\n");
}

/** True when the value looks like a designer canvas state (as opposed to upload metadata). */
export function isCanvasState(value: unknown): value is SerializedCanvasState {
  return !!value && typeof value === "object" && Array.isArray((value as { elements?: unknown }).elements) && !!(value as { dimensionsMm?: unknown }).dimensionsMm;
}
