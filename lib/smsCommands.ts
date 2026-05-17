/**
 * SMS mutation commands.
 *
 * Inbound dealer SMS like "delete my F-150" or "change price on Bronco
 * to 32500" gets routed here from app/api/sms/inbound/route.ts after
 * intent classification.
 *
 * Each command is a two-step flow:
 *   1. Parse + disambiguate. Find the target item by free-text query
 *      (model/make/trim/title/ID). If 0 matches: reply "I couldn't find
 *      it." If 1: stage the action in pendingPayload and ask for YES.
 *      If many: list the options and ask the dealer to pick by number.
 *   2. On the dealer's follow-up YES (or numeric pick), execute the
 *      mutation, clear pendingPayload, and reply with the result.
 *
 * All mutations are soft-only:
 *   - delete         -> Vehicle.archivedAt / Listing.archivedAt
 *   - change_price   -> Vehicle.price / Listing.price (numeric)
 *   - reset_image    -> Vehicle.spotlightImageUrl = null
 *                       (storefront falls back to original imageUrl)
 *   - mark_sold      -> Vehicle.stateOfVehicle = "sold"
 *                       (Meta uses this for catalog availability)
 *   - mark_published -> Listing.publishStatus = "published"
 *   - mark_draft     -> Listing.publishStatus = "draft"
 *   - change_title   -> Vehicle.description / Listing.title
 *   - change_desc    -> Vehicle.description / Listing description in data
 *
 * Confirmation expires after 5 minutes (pendingExpiresAt). If the
 * dealer texts YES 10 minutes later, we treat it as a stale intent
 * and require them to restate the command.
 */
import { prisma } from "@/lib/prisma";
import { withBreaker, CircuitOpenError } from "@/lib/circuitBreaker";
import { GoogleGenAI } from "@google/genai";

export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type CommandKind =
  | "delete"
  | "change_price"
  | "reset_image"
  | "mark_sold"
  | "mark_published"
  | "mark_draft"
  | "change_title"
  | "change_description";

export interface PendingCommand {
  kind: CommandKind;
  /** Type of inventory the target points to. */
  targetType: "vehicle" | "listing";
  /** Stable DB ID once disambiguation resolved to a single item. */
  targetId: string;
  /** Human-readable label for the dealer-facing confirmation message. */
  targetLabel: string;
  /** Optional payload for mutations that need a value (price, title text, etc.). */
  value?: string | number;
}

export interface CommandResult {
  /** Whether to send a reply now (vs. silence). */
  reply: string;
  /** New conversation state, if it should change. */
  state?: "idle" | "awaiting_confirmation" | "awaiting_pick";
  /** Updated pendingPayload to persist. Null = clear. */
  pendingPayload?: Record<string, unknown> | null;
  /** Updated pendingExpiresAt to persist. Null = clear. */
  pendingExpiresAt?: Date | null;
}

// ---------------------------------------------------------------------
// Item disambiguation
// ---------------------------------------------------------------------

interface DisambiguatedItem {
  type: "vehicle" | "listing";
  id: string;
  label: string;
}

/**
 * Search a dealer's inventory by free-text query. Returns up to N matches.
 *
 * Matching strategy:
 *   - Automotive: query against year, make, model, trim, vin, description
 *     (case-insensitive partial match).
 *   - Non-automotive: query against listing.title.
 *   - If the query is a UUID, match by ID directly (precise path).
 *
 * Excludes archived items so "delete F-150" can't double-archive.
 */
export async function searchInventory(
  dealerId: string,
  vertical: string,
  query: string,
  limit = 5
): Promise<DisambiguatedItem[]> {
  const trimmed = query.trim();

  // Direct UUID match short-circuit.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    if (vertical === "automotive") {
      const v = await prisma.vehicle.findFirst({
        where: { id: trimmed, dealerId, archivedAt: null },
        select: { id: true, year: true, make: true, model: true, trim: true },
      });
      if (v) {
        return [
          {
            type: "vehicle",
            id: v.id,
            label: formatVehicleLabel(v),
          },
        ];
      }
    } else {
      const l = await prisma.listing.findFirst({
        where: { id: trimmed, dealerId, archivedAt: null },
        select: { id: true, title: true },
      });
      if (l) {
        return [{ type: "listing", id: l.id, label: l.title || "Untitled" }];
      }
    }
    return [];
  }

  // Free-text fuzzy match.
  if (vertical === "automotive") {
    const q = trimmed.toLowerCase();
    // Pull a reasonable batch and rank in-app rather than building a
    // huge OR clause. At dealer scale (tens to low hundreds of vehicles)
    // this is fast and lets us score across multiple fields.
    const vehicles = await prisma.vehicle.findMany({
      where: { dealerId, archivedAt: null },
      select: { id: true, year: true, make: true, model: true, trim: true, vin: true, description: true },
      take: 500,
    });
    const scored = vehicles
      .map((v) => ({
        item: v,
        score: scoreVehicleMatch(v, q),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s) => ({
      type: "vehicle" as const,
      id: s.item.id,
      label: formatVehicleLabel(s.item),
    }));
  }

  // Non-automotive: listing title ILIKE.
  const listings = await prisma.listing.findMany({
    where: {
      dealerId,
      archivedAt: null,
      title: { contains: trimmed, mode: "insensitive" },
    },
    select: { id: true, title: true },
    take: limit,
  });
  return listings.map((l) => ({
    type: "listing" as const,
    id: l.id,
    label: l.title || "Untitled",
  }));
}

function scoreVehicleMatch(
  v: { year: string | null; make: string | null; model: string | null; trim: string | null; vin: string | null; description: string | null },
  q: string
): number {
  let score = 0;
  const fields: Array<[string | null, number]> = [
    [v.year, 1],
    [v.make, 3],
    [v.model, 5], // model matches are highest signal ("F-150" -> Model=F-150)
    [v.trim, 2],
    [v.vin, 4], // VIN is a great precision indicator
    [v.description, 1],
  ];
  for (const [field, weight] of fields) {
    if (!field) continue;
    const lower = field.toLowerCase();
    if (lower === q) score += weight * 5; // exact-match boost
    else if (lower.includes(q)) score += weight * 2;
    else if (q.includes(lower)) score += weight;
  }
  return score;
}

function formatVehicleLabel(v: {
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || "Vehicle";
}

// ---------------------------------------------------------------------
// Stage a command (ask for confirmation)
// ---------------------------------------------------------------------

/**
 * Single source of truth for "we want to do X, ask the dealer to confirm".
 * Builds the reply text, the pendingPayload, and the new state. Caller is
 * responsible for persisting the conversation update.
 */
export function stageCommand(cmd: PendingCommand): CommandResult {
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);
  return {
    reply: describePendingCommand(cmd) + "\n\nReply YES to confirm or NO to cancel.",
    state: "awaiting_confirmation",
    pendingPayload: cmd as unknown as Record<string, unknown>,
    pendingExpiresAt: expiresAt,
  };
}

function describePendingCommand(cmd: PendingCommand): string {
  switch (cmd.kind) {
    case "delete":
      return `Delete "${cmd.targetLabel}"?`;
    case "change_price":
      return `Change price of "${cmd.targetLabel}" to $${cmd.value}?`;
    case "reset_image":
      return `Reset "${cmd.targetLabel}" to its original photo?`;
    case "mark_sold":
      return `Mark "${cmd.targetLabel}" as sold?`;
    case "mark_published":
      return `Publish "${cmd.targetLabel}"?`;
    case "mark_draft":
      return `Move "${cmd.targetLabel}" back to draft?`;
    case "change_title":
      return `Change title of "${cmd.targetLabel}" to "${cmd.value}"?`;
    case "change_description":
      return `Update description on "${cmd.targetLabel}"?`;
  }
}

// ---------------------------------------------------------------------
// Execute a confirmed command
// ---------------------------------------------------------------------

/**
 * Run the pending mutation. Caller has already validated that the dealer
 * said YES and that the command hasn't expired.
 *
 * Returns the dealer-facing success message. On error returns a
 * dealer-friendly message and logs the technical detail server-side.
 */
export async function executeCommand(cmd: PendingCommand, dealerId: string): Promise<string> {
  try {
    switch (cmd.kind) {
      case "delete":
        return await cmdDelete(cmd, dealerId);
      case "change_price":
        return await cmdChangePrice(cmd, dealerId);
      case "reset_image":
        return await cmdResetImage(cmd, dealerId);
      case "mark_sold":
        return await cmdMarkSold(cmd, dealerId);
      case "mark_published":
      case "mark_draft":
        return await cmdSetPublishStatus(cmd, dealerId);
      case "change_title":
        return await cmdChangeTitle(cmd, dealerId);
      case "change_description":
        return await cmdChangeDescription(cmd, dealerId);
    }
  } catch (err) {
    console.error({
      event: "sms_command_failed",
      kind: cmd.kind,
      targetType: cmd.targetType,
      targetId: cmd.targetId,
      dealerId,
      message: err instanceof Error ? err.message : String(err),
    });
    return "Sorry, something went wrong on our end. Try again in a minute.";
  }
}

async function cmdDelete(cmd: PendingCommand, dealerId: string): Promise<string> {
  const now = new Date();
  if (cmd.targetType === "vehicle") {
    const r = await prisma.vehicle.updateMany({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      data: { archivedAt: now },
    });
    if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found or was already deleted.`;
  } else {
    const r = await prisma.listing.updateMany({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      data: { archivedAt: now },
    });
    if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found or was already deleted.`;
  }
  return `Deleted "${cmd.targetLabel}". You can restore it from the dashboard.`;
}

async function cmdChangePrice(cmd: PendingCommand, dealerId: string): Promise<string> {
  const price = typeof cmd.value === "number" ? cmd.value : Number(cmd.value);
  if (!Number.isFinite(price) || price < 0) {
    return "That price doesn't look right. Try again with just a number (e.g. 32500).";
  }
  if (cmd.targetType === "vehicle") {
    const r = await prisma.vehicle.updateMany({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      data: { price },
    });
    if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  } else {
    const r = await prisma.listing.updateMany({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      data: { price },
    });
    if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  }
  return `Done — "${cmd.targetLabel}" is now $${price.toLocaleString()}.`;
}

async function cmdResetImage(cmd: PendingCommand, dealerId: string): Promise<string> {
  if (cmd.targetType !== "vehicle") {
    return "Reset-image is only available for vehicles right now.";
  }
  const r = await prisma.vehicle.updateMany({
    where: { id: cmd.targetId, dealerId, archivedAt: null },
    data: { spotlightImageUrl: null },
  });
  if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  return `Reset — "${cmd.targetLabel}" now shows its original photo.`;
}

async function cmdMarkSold(cmd: PendingCommand, dealerId: string): Promise<string> {
  if (cmd.targetType !== "vehicle") {
    return "Mark-sold is only available for vehicles. Use 'unpublish' for services.";
  }
  const r = await prisma.vehicle.updateMany({
    where: { id: cmd.targetId, dealerId, archivedAt: null },
    data: { stateOfVehicle: "sold" },
  });
  if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  return `Marked "${cmd.targetLabel}" as sold. Meta will reflect this on the next sync.`;
}

async function cmdSetPublishStatus(cmd: PendingCommand, dealerId: string): Promise<string> {
  if (cmd.targetType !== "listing") {
    return "Publish/draft is only available for service, real-estate, and product listings.";
  }
  const newStatus = cmd.kind === "mark_published" ? "published" : "draft";
  const r = await prisma.listing.updateMany({
    where: { id: cmd.targetId, dealerId, archivedAt: null },
    data: { publishStatus: newStatus },
  });
  if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  return newStatus === "published"
    ? `Published "${cmd.targetLabel}".`
    : `Moved "${cmd.targetLabel}" back to draft.`;
}

async function cmdChangeTitle(cmd: PendingCommand, dealerId: string): Promise<string> {
  const title = String(cmd.value ?? "").trim();
  if (!title) return "I didn't catch the new title.";
  if (title.length > 200) return "That title is too long. Try something shorter than 200 characters.";
  if (cmd.targetType === "vehicle") {
    // Vehicles don't have a "title" column; description is the closest analog.
    const r = await prisma.vehicle.updateMany({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      data: { description: title },
    });
    if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  } else {
    const r = await prisma.listing.updateMany({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      data: { title },
    });
    if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  }
  return `Updated title to "${title}".`;
}

async function cmdChangeDescription(cmd: PendingCommand, dealerId: string): Promise<string> {
  const desc = String(cmd.value ?? "").trim();
  if (!desc) return "I didn't catch the new description.";
  if (desc.length > 2000) return "That description is too long. Trim it to 2000 characters or fewer.";
  if (cmd.targetType === "vehicle") {
    const r = await prisma.vehicle.updateMany({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      data: { description: desc },
    });
    if (r.count === 0) return `"${cmd.targetLabel}" couldn't be found.`;
  } else {
    // Listings store description inside the `data` JSON column.
    const listing = await prisma.listing.findFirst({
      where: { id: cmd.targetId, dealerId, archivedAt: null },
      select: { data: true },
    });
    if (!listing) return `"${cmd.targetLabel}" couldn't be found.`;
    const data = (listing.data as Record<string, unknown>) ?? {};
    await prisma.listing.update({
      where: { id: cmd.targetId },
      data: { data: { ...data, description: desc } },
    });
  }
  return `Updated description on "${cmd.targetLabel}".`;
}

// ---------------------------------------------------------------------
// Command parsing (free-text -> CommandKind + query + value)
// ---------------------------------------------------------------------

/**
 * Parsed user command before disambiguation. Caller resolves the
 * `query` against inventory and then stages or executes accordingly.
 */
export interface ParsedCommand {
  kind: CommandKind;
  /** Free-text item identifier the dealer typed. */
  query: string;
  /** Value for mutations that take one (price, title, description). */
  value?: string | number;
}

const DELETE_RE = /^(delete|remove|archive)\s+(.+)$/i;
const PRICE_RE = /^(change\s+price\s+(?:on|for)\s+|set\s+price\s+(?:on|for)\s+|price\s+)(.+?)(?:\s+to)?\s+\$?([\d,]+(?:\.\d+)?)\s*$/i;
const PRICE_RE_2 = /^(.+?)\s+(?:price|to)\s+\$?([\d,]+(?:\.\d+)?)\s*$/i;
const RESET_IMAGE_RE = /^reset\s+(?:ai\s+)?image\s+(?:on\s+|for\s+)?(.+)$/i;
const MARK_SOLD_RE = /^(mark|set)\s+(.+?)\s+(?:as\s+)?sold\s*$/i;
const MARK_PUBLISHED_RE = /^(publish|mark)\s+(.+?)(?:\s+as\s+published)?\s*$/i;
const MARK_DRAFT_RE = /^(unpublish|draft)\s+(.+)$/i;
const CHANGE_TITLE_RE = /^(?:change|set|rename)\s+title\s+(?:on|for)\s+(.+?)\s+to\s+"?(.+?)"?\s*$/i;
const CHANGE_DESC_RE = /^(?:change|set|update)\s+description\s+(?:on|for)\s+(.+?)\s+to\s+"?(.+?)"?\s*$/i;

export function parseCommand(body: string): ParsedCommand | null {
  const trimmed = body.trim();

  let m = trimmed.match(DELETE_RE);
  if (m) return { kind: "delete", query: m[2].trim() };

  // Try the explicit "change price on X to Y" form first; if it matches,
  // the third capture group is the price.
  m = trimmed.match(PRICE_RE);
  if (m) {
    const price = Number(m[3].replace(/,/g, ""));
    if (Number.isFinite(price)) {
      return { kind: "change_price", query: m[2].trim(), value: price };
    }
  }

  m = trimmed.match(RESET_IMAGE_RE);
  if (m) return { kind: "reset_image", query: m[1].trim() };

  m = trimmed.match(MARK_SOLD_RE);
  if (m) return { kind: "mark_sold", query: m[2].trim() };

  m = trimmed.match(MARK_DRAFT_RE);
  if (m) return { kind: "mark_draft", query: m[2].trim() };

  m = trimmed.match(CHANGE_TITLE_RE);
  if (m) return { kind: "change_title", query: m[1].trim(), value: m[2].trim() };

  m = trimmed.match(CHANGE_DESC_RE);
  if (m) return { kind: "change_description", query: m[1].trim(), value: m[2].trim() };

  // Publish needs to come AFTER the "publish/draft" specific regex
  // because "publish X" could also match generic mark patterns.
  m = trimmed.match(MARK_PUBLISHED_RE);
  if (m && /publish/i.test(m[1])) return { kind: "mark_published", query: m[2].trim() };

  // Loose "X price 32500" / "X to 32500" form.
  m = trimmed.match(PRICE_RE_2);
  if (m) {
    const price = Number(m[2].replace(/,/g, ""));
    if (Number.isFinite(price) && price >= 100) {
      // Guardrail: tiny numbers ("hello to 5") aren't real prices.
      return { kind: "change_price", query: m[1].trim(), value: price };
    }
  }

  return null;
}

/**
 * Fallback Gemini parser for messages that don't match the regex grammar.
 * Asks the model to extract {kind, query, value} or return null. Wrapped
 * in our circuit breaker; returns null on any failure rather than
 * inventing commands.
 */
export async function parseCommandWithGemini(body: string): Promise<ParsedCommand | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are extracting a structured command from a car dealer's SMS message.

Supported commands:
  - delete                 (delete/archive a listing)
  - change_price           (change the price; needs a numeric value)
  - reset_image            (revert AI-generated image to original)
  - mark_sold              (mark a vehicle as sold)
  - mark_published         (publish a draft listing)
  - mark_draft             (unpublish a listing)
  - change_title           (rename a listing; needs new title string)
  - change_description     (update description; needs new description string)

Given the dealer's SMS, respond with ONLY a JSON object:
  { "kind": "<one of the above>", "query": "<free-text item identifier>", "value": <number or string, omit if not needed> }

If the message is not a command (e.g. greetings, questions, a URL), respond with: { "kind": null }

Examples:
  "delete my F-150" -> { "kind": "delete", "query": "F-150" }
  "change the bronco to 42000" -> { "kind": "change_price", "query": "bronco", "value": 42000 }
  "reset ai image on the silverado" -> { "kind": "reset_image", "query": "silverado" }
  "the 2024 raptor is sold" -> { "kind": "mark_sold", "query": "2024 raptor" }
  "publish the deep cleaning service" -> { "kind": "mark_published", "query": "deep cleaning" }
  "rename listing abc to Premium Detail" -> { "kind": "change_title", "query": "abc", "value": "Premium Detail" }
  "hello" -> { "kind": null }

Now extract from:
"${body}"`;

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await withBreaker(
      "gemini.smsCommand",
      () =>
        ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ text: prompt }],
          config: { responseMimeType: "application/json" },
        }),
      { timeoutMs: 10_000 }
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) return null;
    return null;
  }

  const rawText =
    response.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim() ?? "";

  try {
    const parsed = JSON.parse(rawText) as {
      kind?: string | null;
      query?: string;
      value?: string | number;
    };
    if (!parsed.kind || parsed.kind === "null") return null;
    const validKinds: CommandKind[] = [
      "delete",
      "change_price",
      "reset_image",
      "mark_sold",
      "mark_published",
      "mark_draft",
      "change_title",
      "change_description",
    ];
    if (!validKinds.includes(parsed.kind as CommandKind)) return null;
    if (!parsed.query || typeof parsed.query !== "string") return null;
    return {
      kind: parsed.kind as CommandKind,
      query: parsed.query,
      value: parsed.value,
    };
  } catch {
    return null;
  }
}

/**
 * Combined: try regex first, fall back to Gemini.
 */
export async function parseCommandAuto(body: string): Promise<ParsedCommand | null> {
  const cheap = parseCommand(body);
  if (cheap) return cheap;
  return parseCommandWithGemini(body);
}
