import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { translate } from "@/lib/translate";

export async function POST(req: NextRequest) {
  let body: { slug?: string; text?: string; lang?: string; tone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { slug, text, lang, tone } = body;

  if (!slug || typeof slug !== "string" || !text || typeof text !== "string") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!lang || typeof lang !== "string" || lang.length > 10) {
    return NextResponse.json({ error: "invalid_lang" }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { slug },
    select: { id: true, vertical: true, translationLang: true, translationTone: true },
  });

  if (!dealer) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (dealer.vertical !== "automotive") {
    return NextResponse.json({ error: "unsupported_vertical" }, { status: 400 });
  }

  const targetLang = lang || dealer.translationLang || "en";
  const targetTone = (typeof tone === "string" && tone) ? tone : (dealer.translationTone || "professional");

  const translated = await translate(text, dealer.id, targetLang, targetTone);

  return NextResponse.json({ translated });
}
