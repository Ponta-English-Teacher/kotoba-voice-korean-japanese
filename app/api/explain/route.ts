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

  const literalOrthographyNote = inputLanguage === "ja"
    ? "Japanese does not use spaces between words in ordinary prose, so write literal_translation as continuous natural Japanese text with no spaces marking word boundaries."
    : "Korean uses spaces between words (띄어쓰기) as normal written Korean, so write literal_translation with natural Korean spacing between words rather than running words together.";

  const koreanWordMappingRules = "Follow these chunking rules: prefer meaningful morpheme or word chunk boundaries (for example, for 자신의 입장은 제대로 알아듣게 했다, the chunks would be 자신의 → 自分の, 입장은 → 立場は, 제대로 → きちんと, 알아듣게 했다 → 分かるようにした / 理解させた); never split a word syllable by syllable; keep the original Korean word order in the array; preserve particles and sentence endings attached to a chunk when they help the learner see Korean structure (for example keep 은/는/이/가/을/를/의 attached to the word they mark, rather than stripped away); for grammatical endings or constructions (causatives, honorifics, connective endings, etc.), make the Japanese equivalent show that function clearly even if the Japanese sounds slightly stiff or unnatural, since structural clarity matters more than smoothness here; where one Korean chunk has no exact Japanese equivalent, give a concise functional equivalent instead. Together the target chunks must cover the whole Korean expression in order, without gaps or overlaps. word_mapping must stay chunk-level, never a single smooth whole-sentence translation.";

  const nuanceNoteJaRule = "Also give 'nuance_note_ja': OPTIONALLY, only when it genuinely helps explain politeness, register, the sentence ending, speaker attitude, relationship, or emotional nuance, provide one short Japanese note of about 1-2 lines (for example: 「-게 했다」は「〜するようにした／〜させた」に近く、話し手が結果を意識的に作ったニュアンスがあります。); otherwise return an empty string \"\". Never force a note when it adds no real value. This is a short supplementary note only — the full, detailed nuance explanation must still be written in English in the 'nuance' field.";

  const attentionNote = targetLanguage === "ja"
    ? "For Japanese, pay close attention to sentence-final forms and whether the line sounds like a statement, a question, a soft confirmation-seeking check, doubt, or surprise (for example the difference between 痛い。 痛い？ 痛くないの？ 痛くないよね？ 会いたい。 and いたの？), as well as politeness level, casualness, directness, the relationship between speakers, emotional tone, and how intonation changes the impression."
    : "For Korean, pay close attention to speech level and sentence-final endings (for example the difference between casual 반말 endings such as -아/어, -지, -거든, polite 해요체 endings such as -아요/어요, and formal 합쇼체 endings such as -습니다/ㅂ니다), politeness, whether the line is respectful or casual, the relationship and closeness between speakers, age or social-status implications only where genuinely relevant, softness versus bluntness, emotional coloring, conversational register, and how intonation changes the impression. Do not stereotype Korean speech by gender — mention gender tendency only when it is linguistically or socially meaningful for that specific expression.";

  const sameLanguageKoreanSupport = targetLanguage === "ko"
    ? ` Additionally, because the expression being practiced is Korean, provide structural Japanese learning support for this exact Korean phrase — based on the phrase itself, not a paraphrase or a different version of it. Give 'literal_translation': a single plain Japanese sentence that mirrors this Korean phrase's word order and grammatical structure as closely as Japanese allows, staying close to the Korean structure rather than reading as a smooth natural translation — some stiffness is fine if it keeps the structure visible; write it as one plain Japanese sentence only, with no parentheses, annotations, or mixed-script word pairs. ${literalOrthographyNote} Also give 'word_mapping': an ordered array of 2 to 8 pedagogically meaningful Korean chunks from this phrase paired with their closest Japanese equivalents, based on the phrase and literal_translation. ${koreanWordMappingRules} ${nuanceNoteJaRule}`
    : ` Since the expression being practiced is already Japanese, set 'literal_translation' to an empty string, 'word_mapping' to an empty array, and 'nuance_note_ja' to an empty string — no extra Japanese structural support is needed here.`;

  const wordMappingGuidance = targetLanguage === "ko"
    ? `Also give 'word_mapping': an ordered array of 2 to 8 pedagogically meaningful Korean chunks from that same alternative's Korean expression, paired with their closest Japanese equivalents, based on literal_translation. ${koreanWordMappingRules}`
    : `Also give 'word_mapping': an ordered array of 2 to 6 short, pedagogically meaningful chunks pairing that same alternative's ${targetName} expression with its ${inputName} equivalent. Each item has 'target' (a meaningful word, particle, ending, or short phrase chunk from the ${targetName} expression, given in the order it appears) and 'equivalent' (the corresponding ${inputName} word, particle, ending, or short phrase chunk from literal_translation — if no single natural equivalent exists, give up to two short options separated by " / "). Chunk by meaningful words, particles, and sentence endings — never split every character or syllable mechanically, never invent a correspondence that is not actually present, and keep the chunks concise and free of technical linguistic jargon. Together the target chunks should cover the whole ${targetName} expression in order without gaps or overlaps, and every equivalent must correspond to literal_translation, not to a free paraphrase.`;

  const alternativeNuanceNoteJaRule = targetLanguage === "ko"
    ? nuanceNoteJaRule
    : "Set 'nuance_note_ja' to an empty string \"\" for every alternative, since the expression being studied is Japanese, not Korean.";

  const instructions = sameLanguage
    ? `You design concise guidance for a Japanese-Korean university language exchange app. The user's input language and target output language are both ${targetName}. This is a pronunciation/intonation practice case, not a translation case. Do not translate, rewrite, correct, normalize, or paraphrase the input in any way. Set both source_text and spoken_expression to the user's input, character for character, including punctuation and sentence-final particles or endings. Then provide three separate pieces of English guidance. 'meaning' must be a short, simple, natural-sounding English equivalent of what the expression means — like a quick gloss, usually well under 15 words, not a linguistic explanation. 'nuance' must be a richer explanation of the expression's tone, speaker attitude, directness, softness or bluntness, politeness or formality, implied feeling, relationship between speakers, age or social-status implication where relevant, conversational register, sentence ending, emotional coloring, and how intonation can change the impression — only mention what is actually useful for this particular expression, never force every category into the answer. 'situation' must be one short, concrete, conversational English description of when someone would naturally say it.${sameLanguageKoreanSupport} ${attentionNote} Return an empty alternatives array. Every field except literal_translation, word_mapping, and nuance_note_ja must be concise, natural English.`
    : `You design concise guidance for a Japanese-Korean university language exchange app. The user's input is written in ${inputName}. The target output language is ${targetName}. Set source_text and spoken_expression to the user's input, character for character and completely unchanged. Create exactly three natural ${targetName} alternatives that preserve communicative intention, emotion, relationship, and situation rather than forcing structural equivalence — this is conversational language learning, not literal translation, so do not force word-for-word equivalence. The roles must be: close (relatively close to the source meaning), natural (especially natural and casual), and nuanced (a useful alternative with different nuance or directness). For every alternative, give in English: the literal meaning of the original source, natural/intended meaning, nuance (covering whatever of speaker attitude, politeness, directness, softness or bluntness, relationship, age or social-status implication, register, sentence ending, emotional coloring, or intonation is genuinely relevant to that alternative — never force every dimension into every expression), and one short realistic context. Also give 'literal_translation': a single natural-order sentence written entirely in ${inputName} that stays as structurally close as possible to that specific alternative's ${targetName} expression. This is a separate, purely structural pedagogical aid, not the natural/intended meaning and not a polished translation — write it as one plain ${inputName} sentence only, never as a word-by-word gloss, never with parentheses, annotations, or mixed-script word pairs, and never containing any ${targetName} text. Mirror the word order and grammatical structure of the ${targetName} expression as closely as ${inputName} allows; preserve important lexical and grammatical correspondences (particles, tense, connective structure); do not add meaning that is not present in the ${targetName} expression; and do not delete grammatical relationships that would be useful for a learner to notice — even if the result sounds slightly unnatural or stiff in ${inputName}. For example, if the ${targetName} expression uses words corresponding to 취업/就職, 준비/準備, 하고 있어/している, 바빠/忙しい, or 때문에/～のせいで, those correspondences should stay visible in the structure of the plain ${inputName} sentence rather than being smoothed away. Base literal_translation strictly on that alternative's own generated ${targetName} expression, not on the original input text. ${literalOrthographyNote} ${wordMappingGuidance} ${alternativeNuanceNoteJaRule} Make the alternatives genuinely distinct, idiomatic, contemporary, and suitable for conversation. Avoid textbook or announcer language. ${attentionNote} Set meaning, nuance, and situation to short filler text since alternatives carry the detail. All fields except literal_translation, word_mapping, and nuance_note_ja must be concise, natural English.`;

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
                literal_translation: { type: "string" },
                word_mapping: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      target: { type: "string" },
                      equivalent: { type: "string" },
                    },
                    required: ["target", "equivalent"],
                    additionalProperties: false,
                  },
                },
                nuance_note_ja: { type: "string" },
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
                      literal_translation: { type: "string" },
                      word_mapping: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            target: { type: "string" },
                            equivalent: { type: "string" },
                          },
                          required: ["target", "equivalent"],
                          additionalProperties: false,
                        },
                      },
                      nuance_note_ja: { type: "string" },
                    },
                    required: ["role", "expression", "literal_meaning", "natural_meaning", "nuance", "context", "literal_translation", "word_mapping", "nuance_note_ja"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["source_text", "spoken_expression", "meaning", "nuance", "situation", "literal_translation", "word_mapping", "nuance_note_ja", "alternatives"],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: 1200,
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
      literal_translation?: unknown;
      word_mapping?: unknown;
      nuance_note_ja?: unknown;
      alternatives?: unknown;
    };

    if (
      guidance.source_text !== text ||
      guidance.spoken_expression !== text ||
      typeof guidance.meaning !== "string" ||
      typeof guidance.nuance !== "string" ||
      typeof guidance.situation !== "string" ||
      typeof guidance.literal_translation !== "string" ||
      !Array.isArray(guidance.word_mapping) ||
      typeof guidance.nuance_note_ja !== "string" ||
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
      literal_translation: sameLanguage ? guidance.literal_translation : "",
      word_mapping: sameLanguage ? guidance.word_mapping : [],
      nuance_note_ja: sameLanguage ? guidance.nuance_note_ja : "",
      alternatives: sameLanguage ? [] : guidance.alternatives,
    });
  } catch (error) {
    console.error("Expression generation error", error);
    return NextResponse.json({ error: "Could not reach the expression service." }, { status: 502 });
  }
}
