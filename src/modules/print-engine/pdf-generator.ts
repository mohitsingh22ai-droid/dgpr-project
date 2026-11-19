import { PDFDocument, rgb } from "pdf-lib";
import { SerializedCanvasState } from "../designer/types";
import { generateStandardPrintFileName } from "./file-naming";
import { addProductionPage, drawCropMarksAndSlug, drawDesign, embedFonts, MM_TO_PT as MM, PRODUCTION_DPI } from "./production-renderer";
import { fitText } from "./text-fit";

export const MM_TO_PT = MM;

export interface RenderPrintPdfOptions {
  orderId: string;
  productType: string;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  canvasState?: SerializedCanvasState;
  customText?: string;
  customNumber?: string;
  subTitle?: string;
}

export interface GeneratedPdfResult {
  fileName: string;
  pdfBytes: Uint8Array;
  mediaBoxPt: { width: number; height: number };
  trimBoxPt: { width: number; height: number };
  bleedMm: number;
  dpi: number;
}

/**
 * Single production PDF (admin render tool and tests). Draws a designer canvas when
 * given, otherwise a simple fitted number/title layout. Uses the shared production
 * renderer: real bleed/trim boxes, crop marks and an embedded Unicode font.
 */
export async function generateProductionPdf(options: RenderPrintPdfOptions): Promise<GeneratedPdfResult> {
  const { orderId, productType, widthMm, heightMm, bleedMm = 3, canvasState, customText, customNumber, subTitle } = options;
  const geo = { widthMm, heightMm, bleedMm };

  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const { page, originX, originTopY } = addProductionPage(pdf, geo);

  if (canvasState?.elements?.length) {
    await drawDesign(pdf, page, { originX, originTopY }, { ...canvasState, dimensionsMm: { ...canvasState.dimensionsMm, ...geo } }, fonts);
  } else {
    const trimX = originX + bleedMm * MM;
    const trimTop = originTopY - bleedMm * MM;
    const trimW = widthMm * MM;
    const trimH = heightMm * MM;
    const measure = (font: typeof fonts.bold) => (t: string, s: number) => font.widthOfTextAtSize(t, s);

    const title = customText || productType.replace(/-/g, " ").toUpperCase();
    const titleSize = fitText(title, { maxWidth: trimW - 20, minFontSize: 6, maxFontSize: 14 }, measure(fonts.bold)).fontSize;
    page.drawText(title, { x: trimX + 10, y: trimTop - 10 - titleSize, size: titleSize, font: fonts.bold, color: rgb(0.9, 0.3, 0.1) });

    const number = customNumber || orderId.replace(/[^0-9]/g, "").slice(-3) || "001";
    const numSize = fitText(number, { maxWidth: trimW - 20, minFontSize: 12, maxFontSize: Math.min(72, trimH * 0.4) }, measure(fonts.bold)).fontSize;
    page.drawText(number, { x: trimX + 10, y: trimTop - trimH / 2 - numSize / 3, size: numSize, font: fonts.bold, color: rgb(0.07, 0.08, 0.1) });

    if (subTitle) {
      const subSize = fitText(subTitle, { maxWidth: trimW - 20, minFontSize: 5, maxFontSize: 10 }, measure(fonts.regular)).fontSize;
      page.drawText(subTitle, { x: trimX + 10, y: trimTop - trimH + 10, size: subSize, font: fonts.regular, color: rgb(0.3, 0.35, 0.4) });
    }
  }

  drawCropMarksAndSlug(page, geo, fonts, `ORDER ${orderId} | ${productType} | TRIM ${widthMm}x${heightMm}mm | BLEED ${bleedMm}mm`);

  const { width, height } = page.getSize();
  return {
    fileName: generateStandardPrintFileName({ orderId, productType, extension: "pdf" }),
    pdfBytes: await pdf.save(),
    mediaBoxPt: { width, height },
    trimBoxPt: { width: widthMm * MM, height: heightMm * MM },
    bleedMm,
    dpi: PRODUCTION_DPI,
  };
}
