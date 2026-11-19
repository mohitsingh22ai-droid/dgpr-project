import fs from "fs";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, rgb, degrees, RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { SerializedCanvasState, TextCanvasElement } from "@/modules/designer/types";
import { toMillimetres, renderDesignFragment } from "@/modules/proofs/design-render";
import { fitText } from "./text-fit";

/**
 * Server-side production renderer (PRD § 07).
 *
 * Draws the approved artwork into a print-ready PDF page: MediaBox with a 10 mm
 * slug, BleedBox, TrimBox, crop marks and a slug line. Geometry comes from the
 * designer's mm model, so the print file matches the approved proof. Text uses an
 * embedded Unicode font (DejaVu Sans) so any customer text (₹, accents, Devanagari
 * digits…) prints instead of crashing the standard-font encoder.
 */

export const MM_TO_PT = 72 / 25.4;
export const SLUG_MM = 10;
export const PRODUCTION_DPI = 300;

export interface PageGeometry {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
}

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

let fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;

function fontBytes() {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "assets", "fonts");
    fontCache = {
      regular: fs.readFileSync(path.join(dir, "DejaVuSans.ttf")),
      bold: fs.readFileSync(path.join(dir, "DejaVuSans-Bold.ttf")),
    };
  }
  return fontCache;
}

export function fontFilePaths(): string[] {
  const dir = path.join(process.cwd(), "assets", "fonts");
  return [path.join(dir, "DejaVuSans.ttf"), path.join(dir, "DejaVuSans-Bold.ttf")];
}

export async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const bytes = fontBytes();
  return {
    regular: await pdf.embedFont(bytes.regular, { subset: true }),
    bold: await pdf.embedFont(bytes.bold, { subset: true }),
  };
}

export function parseColor(value: string | undefined, fallback: RGB = rgb(0, 0, 0)): RGB {
  if (!value) return fallback;
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return rgb(parseInt(hex[0] + hex[0], 16) / 255, parseInt(hex[1] + hex[1], 16) / 255, parseInt(hex[2] + hex[2], 16) / 255);
  }
  if (/^[0-9a-f]{6}/i.test(hex)) {
    return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  }
  return fallback;
}

/** Adds a page sized for the job and sets its print boxes. Returns the page and bleed-box origin (pt, PDF coords). */
export function addProductionPage(pdf: PDFDocument, geo: PageGeometry): { page: PDFPage; originX: number; originTopY: number } {
  const { widthMm: w, heightMm: h, bleedMm: b } = geo;
  const pageW = (w + 2 * (b + SLUG_MM)) * MM_TO_PT;
  const pageH = (h + 2 * (b + SLUG_MM)) * MM_TO_PT;
  const page = pdf.addPage([pageW, pageH]);
  page.setMediaBox(0, 0, pageW, pageH);
  page.setBleedBox(SLUG_MM * MM_TO_PT, SLUG_MM * MM_TO_PT, (w + 2 * b) * MM_TO_PT, (h + 2 * b) * MM_TO_PT);
  page.setTrimBox((SLUG_MM + b) * MM_TO_PT, (SLUG_MM + b) * MM_TO_PT, w * MM_TO_PT, h * MM_TO_PT);
  return { page, originX: SLUG_MM * MM_TO_PT, originTopY: pageH - SLUG_MM * MM_TO_PT };
}

export function drawCropMarksAndSlug(page: PDFPage, geo: PageGeometry, fonts: Fonts, slug: string): void {
  const { widthMm: w, heightMm: h, bleedMm: b } = geo;
  const left = (SLUG_MM + b) * MM_TO_PT;
  const bottom = (SLUG_MM + b) * MM_TO_PT;
  const right = left + w * MM_TO_PT;
  const top = bottom + h * MM_TO_PT;
  const gap = b * MM_TO_PT + 2;
  const len = 6 * MM_TO_PT;
  const black = rgb(0, 0, 0);
  const marks: Array<[number, number, number, number]> = [
    [left - gap - len, bottom, left - gap, bottom], [left, bottom - gap - len, left, bottom - gap],
    [right + gap, bottom, right + gap + len, bottom], [right, bottom - gap - len, right, bottom - gap],
    [left - gap - len, top, left - gap, top], [left, top + gap, left, top + gap + len],
    [right + gap, top, right + gap + len, top], [right, top + gap, right, top + gap + len],
  ];
  for (const [x1, y1, x2, y2] of marks) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.25, color: black });
  }
  page.drawText(slug, { x: SLUG_MM * MM_TO_PT, y: 3 * MM_TO_PT, size: 6, font: fonts.regular, color: rgb(0.35, 0.35, 0.35) });
}

/** Rotates point `p` around `pivot` by `deg` (PDF, counter-clockwise positive). */
function rotateAround(p: { x: number; y: number }, pivot: { x: number; y: number }, deg: number) {
  const r = (deg * Math.PI) / 180;
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * Math.cos(r) - dy * Math.sin(r), y: pivot.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

function dataUrlBytes(src: string): { kind: "png" | "jpg"; bytes: Buffer } | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(src.replace(/\s+/g, ""));
  if (!m) return null;
  return { kind: m[1].toLowerCase() === "png" ? "png" : "jpg", bytes: Buffer.from(m[2], "base64") };
}

export interface RenderReport {
  /** Text placeholders that could not fit even at minimum size (flag for pre-press). */
  overflowingText: string[];
}

/**
 * Draws a designer canvas onto a production page. `substitutions` replaces
 * `{{Column}}` tokens in text elements (CSV variable data); substituted text is
 * always fitted to its box with the shared shrink-to-fit/tracking rules.
 */
export async function drawDesign(
  pdf: PDFDocument,
  page: PDFPage,
  origin: { originX: number; originTopY: number },
  state: SerializedCanvasState,
  fonts: Fonts,
  substitutions?: Record<string, string>
): Promise<RenderReport> {
  const report: RenderReport = { overflowingText: [] };
  const k = MM_TO_PT;
  const { widthMm, heightMm, bleedMm } = state.dimensionsMm;

  page.drawRectangle({
    x: origin.originX,
    y: origin.originTopY - (heightMm + 2 * bleedMm) * k,
    width: (widthMm + 2 * bleedMm) * k,
    height: (heightMm + 2 * bleedMm) * k,
    color: parseColor(state.backgroundColor, rgb(1, 1, 1)),
  });

  for (const el of toMillimetres(state)) {
    const src = el.source;
    const pivot = { x: origin.originX + el.xMm * k, y: origin.originTopY - el.yMm * k };
    const rotation = -(src.rotation || 0);
    const opacity = src.opacity ?? 1;

    if (src.type === "text") {
      const t = src as TextCanvasElement;
      const font = t.isBold ? fonts.bold : fonts.regular;
      const hasTokens = /\{\{\s*[^}]+\s*\}\}/.test(t.text);
      const text = substitutions
        ? t.text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => substitutions[key] ?? "")
        : t.text;
      let size = (el.fontSizeMm ?? 4) * k;
      let letterSpacing = 0;

      const boxMm = t.maxWidth ? t.maxWidth / (state.pxPerMm || 1) : widthMm + bleedMm - el.xMm;
      if (t.autoShrink || hasTokens || t.maxWidth) {
        const fit = fitText(
          text,
          { maxWidth: boxMm * k, minFontSize: Math.min(size, 6), maxFontSize: size, tracking: 0, minTracking: -0.05 },
          (s, fs) => font.widthOfTextAtSize(s, fs)
        );
        size = fit.fontSize;
        letterSpacing = fit.letterSpacing;
        if (!fit.fits) report.overflowingText.push(text);
      }

      const ascent = font.heightAtSize(size, { descender: false });
      const width = font.widthOfTextAtSize(text, size) + Math.max(0, [...text].length - 1) * letterSpacing;
      const alignOffset = t.align === "center" ? (boxMm * k - width) / 2 : t.align === "right" ? boxMm * k - width : 0;
      const start = rotateAround({ x: pivot.x + (t.maxWidth ? alignOffset : 0), y: pivot.y - ascent }, pivot, rotation);

      if (letterSpacing === 0) {
        page.drawText(text, { x: start.x, y: start.y, size, font, color: parseColor(t.fill), opacity, rotate: degrees(rotation) });
      } else {
        // Tracking: place glyphs individually along the rotated baseline.
        let advance = 0;
        for (const ch of text) {
          const p = rotateAround({ x: start.x + advance, y: start.y }, start, rotation);
          page.drawText(ch, { x: p.x, y: p.y, size, font, color: parseColor(t.fill), opacity, rotate: degrees(rotation) });
          advance += font.widthOfTextAtSize(ch, size) + letterSpacing;
        }
      }
    } else if (src.type === "rect" || src.type === "circle") {
      const w = el.widthMm * k;
      const h = el.heightMm * k;
      if (src.type === "rect") {
        const corner = rotateAround({ x: pivot.x, y: pivot.y - h }, pivot, rotation);
        page.drawRectangle({ x: corner.x, y: corner.y, width: w, height: h, color: parseColor(src.fill), opacity, rotate: degrees(rotation) });
      } else {
        const centre = rotateAround({ x: pivot.x + w / 2, y: pivot.y - h / 2 }, pivot, rotation);
        page.drawEllipse({ x: centre.x, y: centre.y, xScale: w / 2, yScale: h / 2, color: parseColor(src.fill), opacity });
      }
    } else if (src.type === "image") {
      const data = dataUrlBytes(src.src);
      if (!data) continue;
      const image = data.kind === "png" ? await pdf.embedPng(data.bytes) : await pdf.embedJpg(data.bytes);
      const w = el.widthMm * k;
      const h = el.heightMm * k;
      const corner = rotateAround({ x: pivot.x, y: pivot.y - h }, pivot, rotation);
      page.drawImage(image, { x: corner.x, y: corner.y, width: w, height: h, opacity, rotate: degrees(rotation) });
    }
  }
  return report;
}

/** Rasterises a designer canvas to a PNG at 300 DPI covering the bleed box. */
export async function renderDesignPng(state: SerializedCanvasState): Promise<Buffer> {
  const { widthMm, heightMm, bleedMm } = state.dimensionsMm;
  const fullW = widthMm + 2 * bleedMm;
  const fullH = heightMm + 2 * bleedMm;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullW} ${fullH}" width="${fullW}mm" height="${fullH}mm">${renderDesignFragment(state)}</svg>`;
  return rasterizeSvg(svg, Math.round((fullW / 25.4) * PRODUCTION_DPI));
}

/** SVG → PNG with resvg (fonts limited to the bundled print fonts). */
export async function rasterizeSvg(svg: string | Buffer, widthPx: number): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.max(1, Math.min(widthPx, 12000)) },
    font: { fontFiles: fontFilePaths(), loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" },
    background: "rgba(255,255,255,1)",
  });
  return Buffer.from(resvg.render().asPng());
}
