import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkSubscription } from "@/lib/checkSubscription";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { getEffectiveDealerId } from "@/lib/impersonation";
import OpenAI from "openai";
import { withBreaker, CircuitOpenError } from "@/lib/circuitBreaker";

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

  const rl = await criticalDurableRateLimit(`transcribe:${dealerId}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!audio || typeof audio === "string") {
    return NextResponse.json({ error: "missing_audio" }, { status: 400 });
  }

  const audioBlob = audio as Blob;
  const audioFile =
    audio instanceof File
      ? audio
      : new File([audioBlob], "audio.webm", { type: audioBlob.type || "audio/webm" });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const result = await withBreaker(
      "openai.transcriptions",
      () =>
        openai.audio.transcriptions.create({
          model: "whisper-1",
          file: audioFile,
        }),
      { timeoutMs: 30_000 }
    );
    return NextResponse.json({ transcript: result.text });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json(
        { error: "transcription_unavailable", retry: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "transcription_failed" }, { status: 502 });
  }
}
