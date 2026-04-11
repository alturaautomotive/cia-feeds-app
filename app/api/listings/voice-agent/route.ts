import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { SERVICES_FIELDS, type VerticalFieldDef } from "@/lib/verticals";
import { GoogleGenAI } from "@google/genai";

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}

interface AgentRequestBody {
  transcript?: unknown;
  history?: unknown;
  collectedFields?: unknown;
}

interface AgentResponse {
  extractedFields: Record<string, string>;
  followUpQuestion: string | null;
  allFieldsFilled: boolean;
}

function normalizeSelectValue(value: string, options: string[]): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const exact = options.find((opt) => opt.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  const partial = options.find(
    (opt) =>
      opt.toLowerCase().includes(trimmed.toLowerCase()) ||
      trimmed.toLowerCase().includes(opt.toLowerCase())
  );
  return partial ?? null;
}

function buildSchemaDescription(fields: VerticalFieldDef[]): string {
  return fields
    .map((f) => {
      const parts = [
        `- key: "${f.key}"`,
        `label: "${f.label}"`,
        `type: ${f.type}`,
        `required: ${f.required}`,
      ];
      if (f.options && f.options.length > 0) {
        parts.push(`allowed values: [${f.options.map((o) => `"${o}"`).join(", ")}]`);
      }
      if (f.placeholder) {
        parts.push(`example: ${f.placeholder}`);
      }
      return parts.join(", ");
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { vertical: true },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  if (dealer.vertical !== "services") {
    return NextResponse.json(
      { error: "voice_agent_unsupported_vertical" },
      { status: 400 }
    );
  }

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  const history: HistoryMessage[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .map((m): HistoryMessage | null => {
          if (!m || typeof m !== "object") return null;
          const obj = m as Record<string, unknown>;
          const role = obj.role === "assistant" ? "assistant" : obj.role === "user" ? "user" : null;
          const text = typeof obj.text === "string" ? obj.text : null;
          if (!role || !text) return null;
          return { role, text };
        })
        .filter((m): m is HistoryMessage => m !== null)
    : [];

  const collectedFields: Record<string, string> =
    body.collectedFields && typeof body.collectedFields === "object"
      ? Object.fromEntries(
          Object.entries(body.collectedFields as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string])
        )
      : {};

  const geminiApiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!geminiApiKey) {
    return NextResponse.json({ error: "misconfigured_gemini" }, { status: 500 });
  }

  const fields = SERVICES_FIELDS;
  const schemaDescription = buildSchemaDescription(fields);

  const historyText =
    history.length > 0
      ? history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n")
      : "(no prior conversation)";

  const collectedText =
    Object.keys(collectedFields).length > 0
      ? JSON.stringify(collectedFields, null, 2)
      : "{}";

  const systemPrompt = `You are a friendly voice assistant helping a small business owner add a new service listing.

Your goal is to extract structured field values from the user's natural-language speech, track what has been collected so far, and ask follow-up questions for anything still missing.

Here is the full schema of the service listing fields you must collect:
${schemaDescription}

Rules:
1. Extract as many field values as you can from the user's latest transcript.
2. Merge your newly extracted values with the fields already collected. If the user corrects a previously collected value, the new value wins.
3. For fields with "allowed values", you MUST pick one of the allowed values (match the user's intent to the closest option). Do not invent new values for those fields.
4. For the "url" field, if the user gives a domain like "example.com" or "bookcleanpro.com", return it as-is — the backend will normalize it.
5. When some required fields are still missing, generate a short, friendly follow-up question asking for 1 or 2 missing fields at a time (not all at once). Speak naturally, like a helpful human.
6. When ALL required fields are filled, set "allFieldsFilled" to true and make "followUpQuestion" a brief confirmation prompt that summarizes the service in one sentence and asks the user to confirm or correct anything.
7. NEVER ask about fields that are already filled unless the user is correcting them.
8. Output ONLY valid JSON matching this shape:
{
  "extractedFields": { "<field_key>": "<value>", ... },
  "followUpQuestion": "<string or null>",
  "allFieldsFilled": <boolean>
}
"extractedFields" must be the FULL merged set of all fields collected so far (previously collected + new extraction), not just the new ones.

Conversation history so far:
${historyText}

Fields already collected:
${collectedText}

User's latest transcript:
"${transcript}"

Respond with the JSON object now.`;

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ text: systemPrompt }],
      config: {
        responseMimeType: "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  const rawText =
    response.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!rawText) {
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  let parsed: AgentResponse;
  try {
    // Gemini with responseMimeType json should return pure JSON, but guard anyway.
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(cleaned) as AgentResponse;
  } catch {
    return NextResponse.json({ error: "parse_failed" }, { status: 502 });
  }

  // Validate and normalize extracted fields
  const rawExtracted =
    parsed.extractedFields && typeof parsed.extractedFields === "object"
      ? (parsed.extractedFields as Record<string, unknown>)
      : {};

  const extractedFields: Record<string, string> = {};
  for (const field of fields) {
    const raw = rawExtracted[field.key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;

    if (field.type === "select" && field.options) {
      const normalized = normalizeSelectValue(value, field.options);
      if (normalized) {
        extractedFields[field.key] = normalized;
      }
      continue;
    }

    extractedFields[field.key] = value;
  }

  // Determine whether all required fields are actually filled (don't trust the model blindly)
  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
  const allFieldsFilled = requiredKeys.every((k) => {
    const v = extractedFields[k];
    return typeof v === "string" && v.trim().length > 0;
  });

  const followUpQuestion =
    typeof parsed.followUpQuestion === "string" && parsed.followUpQuestion.trim()
      ? parsed.followUpQuestion.trim()
      : null;

  return NextResponse.json({
    extractedFields,
    followUpQuestion,
    allFieldsFilled,
  });
}
