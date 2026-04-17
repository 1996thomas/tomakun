import type { Locale } from "@/lib/i18n.shared";
import type { GrammarExplainRequest, GrammarExplainResult } from "@/types/grammar-ai";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const FALLBACK_MODEL = "openai/gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 220;

function buildSystemPrompt(locale: Locale): string {
  const lang = locale === "fr" ? "francais" : "english";
  return [
    "You are a concise Japanese grammar tutor for JLPT learners.",
    `Answer strictly in ${lang}.`,
    "Be short, concrete, and aligned to the provided level/context.",
    "Never invent facts; if uncertain, state uncertainty briefly.",
    "Each field should be 1-2 short sentences max.",
    "Return ONLY valid JSON with these exact keys:",
    "ruleSummary, whyThisIsCorrect, whyCommonMistake, extraExampleJp, extraExampleRomaji, extraExampleTranslation, memoryTip",
  ].join(" ");
}

function buildUserPrompt(input: GrammarExplainRequest): string {
  const compactPayload = {
    lv: input.current.level,
    struct: input.current.structure,
    meaning: input.current.meaning,
    ex: input.current.example,
    exMeaning: input.current.exampleMeaning,
    qType: input.question.type,
    qPrompt: input.question.prompt,
    answer: input.question.answer,
    selected: input.selectedChoice,
    choices: input.question.choices,
  };

  return JSON.stringify(
    {
      task: "Explain this exact grammar question with short, practical guidance.",
      ctx: compactPayload,
      constraints: "Keep it compact. Focus on this question only.",
    },
    null,
    0,
  );
}

function safeJsonParse(payload: string): GrammarExplainResult | null {
  try {
    const parsed = JSON.parse(payload) as Partial<GrammarExplainResult>;
    if (
      typeof parsed.ruleSummary !== "string" ||
      typeof parsed.whyThisIsCorrect !== "string" ||
      typeof parsed.whyCommonMistake !== "string" ||
      typeof parsed.extraExampleJp !== "string" ||
      typeof parsed.extraExampleRomaji !== "string" ||
      typeof parsed.extraExampleTranslation !== "string" ||
      typeof parsed.memoryTip !== "string"
    ) {
      return null;
    }
    return {
      ruleSummary: parsed.ruleSummary.trim(),
      whyThisIsCorrect: parsed.whyThisIsCorrect.trim(),
      whyCommonMistake: parsed.whyCommonMistake.trim(),
      extraExampleJp: parsed.extraExampleJp.trim(),
      extraExampleRomaji: parsed.extraExampleRomaji.trim(),
      extraExampleTranslation: parsed.extraExampleTranslation.trim(),
      memoryTip: parsed.memoryTip.trim(),
    };
  } catch {
    return null;
  }
}

export async function explainGrammarWithOpenRouter(
  input: GrammarExplainRequest,
): Promise<GrammarExplainResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const model = process.env.OPENROUTER_MODEL ?? FALLBACK_MODEL;
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Tomakun Grammar Assistant",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
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
    throw new Error(`OpenRouter error (${response.status}): ${details.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);
  if (!parsed) {
    throw new Error("Invalid model response format");
  }
  return parsed;
}
