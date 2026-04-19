import { supabaseAdmin } from "@/lib/supabase";

export interface ImageValidationResult {
  listingId: string;
  imageUrl: string;
  httpStatus: number | null;
  contentType: string | null;
  redirectChain: string[];
  isCrawlerSafe: boolean;
  failureReason: string | null;
}

export async function validateImageUrl(url: string): Promise<ImageValidationResult> {
  const redirectChain: string[] = [url];
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let isCrawlerSafe = false;
  let failureReason: string | null = null;
  let currentUrl = url;

  try {
    let response: Response | null = null;

    for (let i = 0; i < 5; i++) {
      response = await fetch(currentUrl, { method: "HEAD", redirect: "manual" });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
        redirectChain.push(currentUrl);
        continue;
      }

      break;
    }

    if (!response) {
      return {
        listingId: "",
        imageUrl: url,
        httpStatus: null,
        contentType: null,
        redirectChain,
        isCrawlerSafe: false,
        failureReason: "network_error",
      };
    }

    httpStatus = response.status;
    contentType = response.headers.get("content-type");
    await response.body?.cancel();

    // Check 1: HTTP 200
    if (httpStatus !== 200) {
      failureReason = "non_200_status";
      return { listingId: "", imageUrl: url, httpStatus, contentType, redirectChain, isCrawlerSafe: false, failureReason };
    }

    // Check 2: Challenge page
    if (contentType && contentType.startsWith("text/html")) {
      failureReason = "challenge_page_detected";
      return { listingId: "", imageUrl: url, httpStatus, contentType, redirectChain, isCrawlerSafe: false, failureReason };
    }

    // Check 3: Content-Type starts with "image/"
    if (!contentType || !contentType.startsWith("image/")) {
      failureReason = "invalid_content_type";
      return { listingId: "", imageUrl: url, httpStatus, contentType, redirectChain, isCrawlerSafe: false, failureReason };
    }

    // Check 4: Signed/Expiring URL
    const finalUrlParams = new URL(currentUrl).searchParams;
    const signedKeys = ["expires", "signature", "x-amz-credential", "se"];
    for (const [key] of finalUrlParams) {
      if (signedKeys.includes(key.toLowerCase())) {
        failureReason = "signed_or_expiring_url";
        return { listingId: "", imageUrl: url, httpStatus, contentType, redirectChain, isCrawlerSafe: false, failureReason };
      }
    }

    isCrawlerSafe = true;

    return { listingId: "", imageUrl: url, httpStatus, contentType, redirectChain, isCrawlerSafe, failureReason };
  } catch {
    return {
      listingId: "",
      imageUrl: url,
      httpStatus: null,
      contentType: null,
      redirectChain,
      isCrawlerSafe: false,
      failureReason: "network_error",
    };
  }
}

const MAX_REHOST_SIZE = 5 * 1024 * 1024; // 5 MB, matches upload-image route

export async function rehostImageToStorage(sourceUrl: string, dealerId: string): Promise<string> {
  const response = await fetch(sourceUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error("Failed to fetch source image: HTTP " + response.status);
  }

  // Check Content-Length header first for an early rejection
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_REHOST_SIZE) {
    await response.body?.cancel();
    throw new Error(`Image exceeds ${MAX_REHOST_SIZE / (1024 * 1024)} MB limit`);
  }

  // Stream the body with a size guard in case Content-Length is absent or wrong
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to read response body");
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REHOST_SIZE) {
      await reader.cancel();
      throw new Error(`Image exceeds ${MAX_REHOST_SIZE / (1024 * 1024)} MB limit`);
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);

  let contentType = response.headers.get("content-type") || "image/jpeg";
  contentType = contentType.split(";")[0].trim();
  if (!contentType.startsWith("image/")) {
    contentType = "image/jpeg";
  }

  const extensionMap: Record<string, string> = {
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const extension = extensionMap[contentType] || ".jpg";

  let sanitizedFilename: string;
  try {
    const pathname = new URL(sourceUrl).pathname;
    const lastSegment = pathname.split("/").pop() || "";
    sanitizedFilename = lastSegment.replace(/[^a-zA-Z0-9.\-]/g, "_");
  } catch {
    sanitizedFilename = "";
  }
  if (!sanitizedFilename) {
    sanitizedFilename = "image";
  }

  const finalFilename = sanitizedFilename.toLowerCase().endsWith(extension)
    ? sanitizedFilename
    : sanitizedFilename + extension;
  const path = `service-images/${dealerId}/${Date.now()}-${finalFilename}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("vehicle-images")
    .upload(path, buffer, { contentType, upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabaseAdmin.storage.from("vehicle-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function validateAndRehostServiceImage(
  imageUrl: string,
  dealerId: string,
  listingId: string
): Promise<{ finalUrl: string; validation: ImageValidationResult }> {
  const validation = await validateImageUrl(imageUrl);
  validation.listingId = listingId;

  if (validation.isCrawlerSafe) {
    return { finalUrl: imageUrl, validation };
  }

  try {
    const rehostedUrl = await rehostImageToStorage(imageUrl, dealerId);
    const rehostedValidation = await validateImageUrl(rehostedUrl);
    rehostedValidation.listingId = listingId;
    return { finalUrl: rehostedUrl, validation: rehostedValidation };
  } catch {
    return { finalUrl: imageUrl, validation };
  }
}
