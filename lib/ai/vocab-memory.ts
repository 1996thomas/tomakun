import type { VocabMemoryTipRequest, VocabMemoryTipResult } from "@/types/vocab-ai";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const FALLBACK_MODEL = "openai/gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 160;

function buildSystemPrompt(locale: "en" | "fr"): string {
  const lang = locale === "fr" ? "francais" : "english";
  return [
    "You are a concise Japanese vocabulary memory coach.",
    `Answer strictly in ${lang}.`,
    "Focus on memorization, reading cue, and practical usage.",
    "Return ONLY valid JSON with keys: mnemonic, readingHook, usageHint.",
    "Each field must be 1-2 short sentences max.",
  ].join(" ");
}

function buildUserPrompt(input: VocabMemoryTipRequest): string {
  return JSON.stringify(
    {
      task: "Give memorization tips for this Japanese card.",
      card: {
        level: input.card.level,
        word: input.card.word,
        reading: input.card.reading,
        meaning: input.card.meaning,
      },
      constraints: "Short, practical, no fluff.",
    },
    null,
    0,
  );
}

function parseResult(raw: string): VocabMemoryTipResult | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VocabMemoryTipResult>;
    if (
      typeof parsed.mnemonic !== "string" ||
      typeof parsed.readingHook !== "string" ||
      typeof parsed.usageHint !== "string"
    ) {
      return null;
    }
    return {
      mnemonic: parsed.mnemonic.trim(),
      readingHook: parsed.readingHook.trim(),
      usageHint: parsed.usageHint.trim(),
    };
  } catch {
    return null;
  }
}

export async function getVocabMemoryTip(input: VocabMemoryTipRequest): Promise<VocabMemoryTipResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Tomakun Vocab Memory Assistant",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? FALLBACK_MODEL,
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(input.locale) },
        { role: "user", content: buildUserPrompt(input) },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenRouter error (${response.status}): ${details.slice(0, 200)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseResult(data.choices?.[0]?.message?.content ?? "");
  if (!parsed) throw new Error("Invalid model response format");
  return parsed;
}
