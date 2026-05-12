/**
 * Validates an uploaded image by inspecting its actual content with `sharp`,
 * not the client-declared MIME type (SECURITY_AUDIT.md F-5.4).
 *
 * Why: a browser-side attacker can POST an HTML/SVG/JS payload with
 * `Content-Type: image/jpeg` and the upload endpoint will happily store it.
 * Without X-Content-Type-Options: nosniff (now set) some clients sniff the
 * body and may execute it; even with nosniff, a stored JS file served from
 * our trusted CDN origin is a serious XSS pivot.
 *
 * `sharp` reads the magic bytes and refuses anything it doesn't recognize as
 * a real raster image. SVGs are rejected explicitly even though sharp can
 * read them, because SVG is an XML document that supports embedded JS.
 */
import sharp from "sharp";

export interface ImageValidationResult {
  ok: boolean;
  reason?: string;
  format?: string;
  width?: number;
  height?: number;
  /** Sanitized content-type to use when saving to storage. */
  contentType?: string;
}

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

const ALLOWED_FORMATS = new Set(Object.keys(FORMAT_TO_MIME));

const MAX_DIMENSION = 16000; // sharp's default; reject pixel-bomb images.

export async function validateImageBuffer(
  buffer: Buffer
): Promise<ImageValidationResult> {
  // Reject obvious non-image payloads up-front by sniffing for SVG/HTML.
  const head = buffer.subarray(0, 512).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype") || head.startsWith("<html")) {
    return { ok: false, reason: "markup_not_allowed" };
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { failOn: "error" }).metadata();
  } catch (err) {
    return {
      ok: false,
      reason: `sharp_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const format = (meta.format ?? "").toLowerCase();
  if (!ALLOWED_FORMATS.has(format)) {
    return { ok: false, reason: `unsupported_format:${format || "unknown"}` };
  }

  if ((meta.width ?? 0) === 0 || (meta.height ?? 0) === 0) {
    return { ok: false, reason: "zero_dimensions" };
  }
  if ((meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION) {
    return { ok: false, reason: "dimensions_too_large" };
  }

  return {
    ok: true,
    format,
    width: meta.width,
    height: meta.height,
    contentType: FORMAT_TO_MIME[format],
  };
}
