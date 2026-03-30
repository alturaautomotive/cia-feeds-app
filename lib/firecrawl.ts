import "@/lib/env";
import FirecrawlApp from "@mendable/firecrawl-js";

export const firecrawlClient = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY ?? "",
});
