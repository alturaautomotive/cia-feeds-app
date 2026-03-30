export interface ScrapeEventPayload {
  dealerId: string;
  url: string;
  durationMs: number;
  fieldsExtracted: string[];
  missingFields: string[];
}

export interface MappingFailurePayload {
  field: string;
  rawValue: unknown;
}

export function logScrapeEvent(payload: ScrapeEventPayload): void {
  console.log({ event: "scrape_complete", ...payload });
}

export function logMappingFailure(payload: MappingFailurePayload): void {
  console.log({ event: "mapping_failure", ...payload });
}

export interface ScrapeStartPayload {
  dealerId: string;
  url: string;
  timestamp: string;
}

export interface ScrapeEndPayload {
  dealerId: string;
  url: string;
  durationMs: number;
  fieldsExtracted: string[];
  missingFields: string[];
}

export interface CsvGenerationPayload {
  slug: string;
  dealerId: string;
  vehicleCount: number;
  durationMs: number;
}

export function logScrapeStart(payload: ScrapeStartPayload): void {
  console.log({ event: "firecrawl_start", ...payload });
}

export function logScrapeEnd(payload: ScrapeEndPayload): void {
  console.log({ event: "firecrawl_end", ...payload });
}

export function logCsvGeneration(payload: CsvGenerationPayload): void {
  console.log({ event: "csv_generated", ...payload });
}
