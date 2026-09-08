import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ResponseOutput = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

function outputText(response: { output?: ResponseOutput[] }) {
  return response.output
    ?.flatMap((item) => item.type === "message" ? item.content ?? [] : [])
    .find((content) => content.type === "output_text")?.text;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "The server is missing its OpenAI API key." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { text, inputLanguage, targetLanguage } = body as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim() || text.length > 4096) {
    return NextResponse.json({ error: "Enter a phrase between 1 and 4096 characters." }, { status: 400 });
  }
  if (inputLanguage !== "ja" && inputLanguage !== "ko") {
    return NextResponse.json({ error: "Unsupported input language." }, { status: 400 });
  }
  if (targetLanguage !== "ja" && targetLanguage !== "ko") {
    return NextResponse.json({ error: "Unsupported target language." }, { status: 400 });
  }

  const inputName = inputLanguage === "ja" ? "Japanese" : "Korean";
  const targetName = targetLanguage === "ja" ? "Japanese" : "Korean";
  const sameLanguage = inputLanguage === targetLanguage;

  const attentionNote = targetLanguage === "ja"
    ? "For Japanese, pay close attention to sentence-final forms and whether the line sounds like a statement, a question, a soft confirmation-seeking check, doubt, or surprise (for example the difference between 痛い。 痛い？ 痛くないの？ 痛くないよね？ 会いたい。 and いたの？), as well as politeness level, casualness, directness, the relationship between speakers, emotional tone, and how intonation changes the impression."
    : "For Korean, pay close attention to speech level and sentence-final endings (for example the difference between casual 반말 endings such as -아/어, -지, -거든, polite 해요체 endings such as -아요/어요, and formal 합쇼체 endings such as -습니다/ㅂ니다), politeness, whether the line is respectful or casual, the relationship and closeness between speakers, age or social-status implications only where genuinely relevant, softness versus bluntness, emotional coloring, conversational register, and how intonation changes the impression. Do not stereotype Korean speech by gender — mention gender tendency only when it is linguistically or socially meaningful for that specific expression.";

  const instructions = sameLanguage
    ? `You design concise guidance for a Japanese-Korean university language exchange app. The user's input language and target output language are both ${targetName}. This is a pronunciation/intonation practice case, not a translation case. Do not translate, rewrite, correct, normalize, or paraphrase the input in any way. Set both source_text and spoken_expression to the user's input, character for character, including punctuation and sentence-final particles or endings. Then provide three separate pieces of English guidance. 'meaning' must be a short, simple, natural-sounding English equivalent of what the expression means — like a quick gloss, usually well under 15 words, not a linguistic explanation. 'nuance' must be a richer explanation of the expression's tone, speaker attitude, directness, softness or bluntness, politeness or formality, implied feeling, relationship between speakers, age or social-status implication where relevant, conversational register, sentence ending, emotional coloring, and how intonation can change the impression — only mention what is actually useful for this particular expression, never force every category into the answer. 'situation' must be one short, concrete, conversational English description of when someone would naturally say it. ${attentionNote} Return an empty alternatives array. All fields must be concise, natural English.`
    : `You design concise guidance for a Japanese-Korean university language exchange app. The user's input is written in ${inputName}. The target output language is ${targetName}. Set source_text and spoken_expression to the user's input, character for character and completely unchanged. Create exactly three natural ${targetName} alternatives that preserve communicative intention, emotion, relationship, and situation rather than forcing structural equivalence — this is conversational language learning, not literal translation, so do not force word-for-word equivalence. The roles must be: close (relatively close to the source meaning), natural (especially natural and casual), and nuanced (a useful alternative with different nuance or directness). For every alternative, give in English: the literal meaning of the original source, natural/intended meaning, nuance (covering whatever of speaker attitude, politeness, directness, softness or bluntness, relationship, age or social-status implication, register, sentence ending, emotional coloring, or intonation is genuinely relevant to that alternative — never force every dimension into every expression), and one short realistic context. Make the alternatives genuinely distinct, idiomatic, contemporary, and suitable for conversation. Avoid textbook or announcer language. ${attentionNote} Set meaning, nuance, and situation to short filler text since alternatives carry the detail. All fields must be concise, natural English.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        store: false,
        instructions,
        input: text,
        text: {
          format: {
            type: "json_schema",
            name: "expression_learning_flow",
            strict: true,
            schema: {
              type: "object",
              properties: {
                source_text: { type: "string" },
                spoken_expression: { type: "string" },
                meaning: { type: "string" },
                nuance: { type: "string" },
                situation: { type: "string" },
                alternatives: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string", enum: ["close", "natural", "nuanced"] },
                      expression: { type: "string" },
                      literal_meaning: { type: "string" },
                      natural_meaning: { type: "string" },
                      nuance: { type: "string" },
                      context: { type: "string" },
                    },
                    required: ["role", "expression", "literal_meaning", "natural_meaning", "nuance", "context"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["source_text", "spoken_expression", "meaning", "nuance", "situation", "alternatives"],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: 900,
      }),
    });

    if (!response.ok) {
      const upstream = await response.json().catch(() => null);
      console.error("OpenAI expression request failed", response.status, upstream?.error?.message);
      return NextResponse.json({ error: "Expression generation failed. Please try again." }, { status: 502 });
    }

    const result = await response.json();
    const resultText = outputText(result);
    if (!resultText) {
      return NextResponse.json({ error: "The expression response was empty." }, { status: 502 });
    }

    const guidance = JSON.parse(resultText) as {
      source_text?: unknown;
      spoken_expression?: unknown;
      meaning?: unknown;
      nuance?: unknown;
      situation?: unknown;
      alternatives?: unknown;
    };

    if (
      guidance.source_text !== text ||
      guidance.spoken_expression !== text ||
      typeof guidance.meaning !== "string" ||
      typeof guidance.nuance !== "string" ||
      typeof guidance.situation !== "string" ||
      !Array.isArray(guidance.alternatives)
    ) {
      return NextResponse.json({ error: "The expression response was invalid." }, { status: 502 });
    }

    if (!sameLanguage) {
      if (guidance.alternatives.length !== 3) {
        return NextResponse.json({ error: "Three alternatives could not be generated." }, { status: 502 });
      }
      const roles = guidance.alternatives.map((item) => (
        typeof item === "object" && item !== null && "role" in item ? item.role : null
      ));
      if (!(["close", "natural", "nuanced"] as const).every((role) => roles.includes(role))) {
        return NextResponse.json({ error: "The alternatives were not sufficiently distinct." }, { status: 502 });
      }
    }

    return NextResponse.json({
      same_language: sameLanguage,
      meaning: guidance.meaning,
      nuance: guidance.nuance,
      situation: guidance.situation,
      alternatives: sameLanguage ? [] : guidance.alternatives,
    });
  } catch (error) {
    console.error("Expression generation error", error);
    return NextResponse.json({ error: "Could not reach the expression service." }, { status: 502 });
  }
}
