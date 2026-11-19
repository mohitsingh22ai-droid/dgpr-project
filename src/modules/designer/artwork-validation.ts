/**
 * Pre-flight checks for uploaded artwork (PRD § 06 upload path).
 *
 * The file type is decided by its content (magic bytes), never by the name or the
 * browser-reported MIME type. Raster artwork gets an effective-resolution check
 * against the ordered print size.
 */

export const MAX_ARTWORK_BYTES = 50 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ["pdf", "svg", "ai", "png", "eps"] as const;
export const MIN_RASTER_DPI = 150; // below this the upload is rejected
export const RECOMMENDED_DPI = 300;

export type ArtworkKind = "pdf" | "ai" | "eps" | "svg" | "png";

export interface ArtworkCheck {
  ok: boolean;
  kind?: ArtworkKind;
  contentType?: string;
  error?: string;
  warnings: string[];
  pixelWidth?: number;
  pixelHeight?: number;
  effectiveDpi?: number;
}

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** Fast checks that need only the name and declared size (before the upload starts). */
export function precheckArtwork(fileName: string, sizeBytes: number): string | null {
  const ext = fileExtension(fileName);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return "Unsupported file type. Upload a PDF, SVG, AI, EPS or PNG file.";
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "The file is empty.";
  if (sizeBytes > MAX_ARTWORK_BYTES) return "Artwork files are limited to 50 MB.";
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[] | string, offset = 0): boolean {
  const sig = typeof signature === "string" ? Array.from(signature, (c) => c.charCodeAt(0)) : signature;
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Validates the actual file contents. `printWidthMm/HeightMm` is the ordered trim size. */
export function inspectArtwork(bytes: Uint8Array, fileName: string, printWidthMm: number, printHeightMm: number): ArtworkCheck {
  const warnings: string[] = [];
  const ext = fileExtension(fileName);

  if (bytes.length === 0) return { ok: false, error: "The file is empty.", warnings };
  if (bytes.length > MAX_ARTWORK_BYTES) return { ok: false, error: "Artwork files are limited to 50 MB.", warnings };

  // PDF (Illustrator .ai files saved with PDF compatibility are PDFs too)
  if (startsWith(bytes, "%PDF-")) {
    const kind: ArtworkKind = ext === "ai" ? "ai" : "pdf";
    const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 4096)));
    if (/\/Encrypt\b/.test(head)) {
      return { ok: false, error: "The PDF is password-protected. Upload an unprotected file.", warnings };
    }
    return { ok: true, kind, contentType: "application/pdf", warnings };
  }

  // PostScript / EPS (and legacy .ai)
  if (startsWith(bytes, "%!PS-Adobe") || startsWith(bytes, [0xc5, 0xd0, 0xd3, 0xc6])) {
    warnings.push("EPS/PostScript files are checked by pre-press before printing.");
    return { ok: true, kind: ext === "ai" ? "ai" : "eps", contentType: "application/postscript", warnings };
  }

  // PNG: read IHDR for pixel size
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    if (bytes.length < 24) return { ok: false, error: "The PNG file is damaged.", warnings };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pixelWidth = view.getUint32(16);
    const pixelHeight = view.getUint32(20);
    if (!pixelWidth || !pixelHeight) return { ok: false, error: "The PNG file is damaged.", warnings };

    const dpi = Math.floor(Math.min(pixelWidth / (printWidthMm / 25.4), pixelHeight / (printHeightMm / 25.4)));
    if (dpi < MIN_RASTER_DPI) {
      return {
        ok: false,
        error: `Resolution too low: ${pixelWidth}×${pixelHeight}px prints at about ${dpi} DPI at ${printWidthMm}×${printHeightMm}mm. At least ${MIN_RASTER_DPI} DPI is required (${RECOMMENDED_DPI} recommended).`,
        warnings,
        pixelWidth,
        pixelHeight,
        effectiveDpi: dpi,
      };
    }
    if (dpi < RECOMMENDED_DPI) {
      warnings.push(`Prints at about ${dpi} DPI. ${RECOMMENDED_DPI} DPI is recommended for sharp results.`);
    }
    const ratioArt = pixelWidth / pixelHeight;
    const ratioPrint = printWidthMm / printHeightMm;
    if (Math.abs(ratioArt - ratioPrint) / ratioPrint > 0.05) {
      warnings.push("The artwork's proportions differ from the print size; it will be scaled to fit inside the trim area.");
    }
    return { ok: true, kind: "png", contentType: "image/png", warnings, pixelWidth, pixelHeight, effectiveDpi: dpi };
  }

  // SVG: text format; reject active content.
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 2 * 1024 * 1024)));
  if (/<svg[\s>]/i.test(text)) {
    if (/<script[\s>]|\son[a-z]+\s*=|javascript:|<foreignObject[\s>]/i.test(text)) {
      return { ok: false, error: "The SVG contains scripts or embedded HTML, which are not allowed.", warnings };
    }
    if (/<(image|use)\b[^>]*\s(xlink:)?href\s*=\s*["']https?:/i.test(text)) {
      return { ok: false, error: "The SVG links to external files. Embed all images in the SVG.", warnings };
    }
    if (/<text[\s>]/i.test(text)) {
      warnings.push("The SVG contains live text. Convert text to outlines to guarantee the right fonts.");
    }
    return { ok: true, kind: "svg", contentType: "image/svg+xml", warnings };
  }

  return { ok: false, error: "The file content is not a valid PDF, SVG, AI, EPS or PNG.", warnings };
}
