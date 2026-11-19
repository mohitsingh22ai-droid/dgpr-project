import { PDFDocument } from "pdf-lib";

export interface ParsedPdfMetadata {
  pageCount: number;
  widthPt: number;
  heightPt: number;
  widthMm: number;
  heightMm: number;
  hasBleedBox: boolean;
  hasTrimBox: boolean;
  trimWidthMm?: number;
  trimHeightMm?: number;
  bleedWidthMm?: number;
  bleedHeightMm?: number;
}

const PT_TO_MM = 25.4 / 72;

/**
 * Asserts true physical PDF geometry according to PRD § 07:
 * Server-side 300 DPI production PDF with real bleed, trim box, and crop marks.
 */
export async function inspectPdfBuffer(pdfBytes: Uint8Array): Promise<ParsedPdfMetadata> {
  const doc = await PDFDocument.load(pdfBytes);
  const pageCount = doc.getPageCount();
  const firstPage = doc.getPage(0);

  const { width, height } = firstPage.getSize();
  const mediaBox = firstPage.getMediaBox();
  const bleedBox = firstPage.getBleedBox();
  const trimBox = firstPage.getTrimBox();

  const widthMm = Number((mediaBox.width * PT_TO_MM).toFixed(2));
  const heightMm = Number((mediaBox.height * PT_TO_MM).toFixed(2));

  const hasBleedBox = !!bleedBox && (bleedBox.width !== mediaBox.width || bleedBox.height !== mediaBox.height);
  const hasTrimBox = !!trimBox && (trimBox.width !== mediaBox.width || trimBox.height !== mediaBox.height);

  return {
    pageCount,
    widthPt: width,
    heightPt: height,
    widthMm,
    heightMm,
    hasBleedBox,
    hasTrimBox,
    trimWidthMm: trimBox ? Number((trimBox.width * PT_TO_MM).toFixed(2)) : undefined,
    trimHeightMm: trimBox ? Number((trimBox.height * PT_TO_MM).toFixed(2)) : undefined,
    bleedWidthMm: bleedBox ? Number((bleedBox.width * PT_TO_MM).toFixed(2)) : undefined,
    bleedHeightMm: bleedBox ? Number((bleedBox.height * PT_TO_MM).toFixed(2)) : undefined,
  };
}
