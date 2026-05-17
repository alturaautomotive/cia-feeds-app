/**
 * Intent classification for inbound SMS messages.
 *
 * Two-tier approach for cost + latency:
 *   1. Cheap deterministic checks first (regex + keyword match) for:
 *      - STOP / UNSUBSCRIBE / CANCEL / END / QUIT (TCPA opt-out)
 *      - START / UNSTOP / YES (opt-in resumption)
 *      - HELP / INFO (carrier-required keyword)
 *      - URLs (regex extraction)
 *   2. Gemini fallback only for messages that don't match cheap rules.
 *
 * Cheap rules cover 80%+ of expected SMS traffic (URL uploads, opt-outs,
 * help requests). Gemini handles the long tail of free-form questions.
 */
import { GoogleGenAI } from "@google/genai";
import { withBreaker, CircuitOpenError } from "@/lib/circuitBreaker";

export type SmsIntent =
  | { type: "stop" }
  | { type: "start" }
  | { type: "help" }
  | { type: "url_upload"; url: string }
  | { type: "confirmation"; affirmative: boolean }
  | { type: "question"; original: string }
  | { type: "unknown"; original: string };

// Carrier-mandated opt-out keywords (any of these, case-insensitive, on its
// own line or with surrounding whitespace, must trigger an opt-out).
const STOP_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

const START_KEYWORDS = new Set(["start", "unstop", "yes"]);

const HELP_KEYWORDS = new Set(["help", "info"]);

const AFFIRMATIVE = new Set(["yes", "y", "yep", "yeah", "sure", "ok", "okay", "confirm"]);
const NEGATIVE = new Set(["no", "n", "nope", "cancel", "stop"]);

/**
 * Extract the first http(s) URL from a free-form SMS body. We support
 * messages like "https://zillow.com/..." and "check this out: https://..."
 * and "https://x.com/y https://x.com/z" (returns first).
 */
function extractUrl(body: string): string | null {
  const match = body.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  // Strip trailing punctuation that's likely not part of the URL.
  return match[0].replace(/[.,;!?)\]]+$/, "");
}

/**
 * Cheap deterministic classification. Returns null if no rule matches and
 * we should fall back to Gemini (or, in the multi-turn case, to context-
 * sensitive interpretation).
 */
export function classifyIntentRuleBased(
  body: string,
  isAwaitingConfirmation = false
): SmsIntent | null {
  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();

  // STOP is the strongest signal — ALWAYS opt-out regardless of context.
  // (Carrier requirement: STOP must work even mid-conversation.)
  if (STOP_KEYWORDS.has(lower)) return { type: "stop" };

  // Multi-turn yes/no check BEFORE the START/HELP keyword check, because
  // "yes" overlaps with START. If we just asked a yes/no question, the
  // dealer's "yes" almost certainly means confirming the question, not
  // re-opting in.
  if (isAwaitingConfirmation) {
    if (AFFIRMATIVE.has(lower)) return { type: "confirmation", affirmative: true };
    if (NEGATIVE.has(lower)) return { type: "confirmation", affirmative: false };
  }

  // Single-word keyword check: exact match against the whole message.
  if (START_KEYWORDS.has(lower)) return { type: "start" };
  if (HELP_KEYWORDS.has(lower)) return { type: "help" };

  // URL extraction (works for both bare URLs and messages containing them).
  const url = extractUrl(trimmed);
  if (url) return { type: "url_upload", url };

  return null;
}

/**
 * Gemini-backed classifier for messages that don't match cheap rules.
 * Used to distinguish a genuine free-form question ("how does this work?")
 * from a misdirected message we should politely punt on.
 *
 * Returns "unknown" if Gemini is unavailable - we never let an AI failure
 * cause an SMS to go unanswered (we send a canned fallback response).
 */
export async function classifyIntentWithGemini(body: string): Promise<SmsIntent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { type: "unknown", original: body };

  const systemPrompt = `You are classifying a dealer's inbound SMS to a B2B catalog management tool called CIA Feeds.

The dealer can do one of these via SMS:
  - Upload a listing/vehicle URL from their own website (the message will contain a URL)
  - Ask a question about the service
  - Reply to a previous question we asked them

Classify the message into EXACTLY ONE of these intents:
  - "question": the dealer is asking a free-form question (e.g. "how do I add a listing?", "is my catalog syncing?")
  - "unknown": the message doesn't fit any other category and likely needs a generic acknowledgement

Respond with a JSON object: {"intent": "<intent_name>"}

Message:
"${body}"

Respond with the JSON object now.`;

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await withBreaker(
      "gemini.smsIntent",
      () =>
        ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ text: systemPrompt }],
          config: { responseMimeType: "application/json" },
        }),
      { timeoutMs: 10_000 }
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return { type: "unknown", original: body };
    }
    return { type: "unknown", original: body };
  }

  const rawText =
    response.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim() ?? "";

  try {
    const parsed = JSON.parse(rawText) as { intent?: string };
    if (parsed.intent === "question") return { type: "question", original: body };
    return { type: "unknown", original: body };
  } catch {
    return { type: "unknown", original: body };
  }
}

/**
 * Top-level entry point. Falls through from cheap rules to Gemini.
 */
export async function classifyIntent(
  body: string,
  opts: { isAwaitingConfirmation?: boolean } = {}
): Promise<SmsIntent> {
  const cheap = classifyIntentRuleBased(body, opts.isAwaitingConfirmation);
  if (cheap) return cheap;
  return classifyIntentWithGemini(body);
}
