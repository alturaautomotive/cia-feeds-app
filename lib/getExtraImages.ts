import { z } from "zod";
import { firecrawlClient } from "@/lib/firecrawl";

const IMAGES_EXTRACTION_PROMPT = `
Extract all main vehicle gallery photo URLs from this Vehicle Detail Page (VDP).
Return an array called "images" containing 10-20 absolute, high-resolution image URLs
of the vehicle itself (not logos, icons, or dealer branding).
`;

const IMAGES_SCHEMA = z.object({
  images: z.array(z.string()),
});

function isValidImageUrl(url: string): boolean {
  if (url.length > 2000 || url.length < 10) return false;
  if (url.startsWith("data:")) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  const lower = url.toLowerCase();
  if (lower.includes("/placeholder") || lower.includes("logo")) return false;
  return true;
}

export async function getExtraImages(vehicleUrl: string): Promise<string[]> {
  try {
    const response = await firecrawlClient.scrape(vehicleUrl, {
      formats: [
        { type: "json", prompt: IMAGES_EXTRACTION_PROMPT, schema: IMAGES_SCHEMA },
      ],
    });

    const raw = (response as { json?: unknown })?.json;
    const parsed =
      raw !== null && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).images)
        ? ((raw as Record<string, unknown>).images as string[])
        : [];

    return parsed.filter(isValidImageUrl);
  } catch {
    return [];
  }
}
