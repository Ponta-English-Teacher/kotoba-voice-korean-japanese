import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Language = "ja" | "ko";
type VoiceStyle = "neutral" | "masculine" | "feminine";
type Pace = "natural" | "slow";

const voices: Record<VoiceStyle, string> = {
  neutral: "marin",
  masculine: "cedar",
  feminine: "coral",
};

function speakingInstructions(language: Language, voiceStyle: VoiceStyle, pace: Pace) {
  const languageDirection = language === "ja"
    ? "Speak in natural, contemporary casual Japanese, as in a relaxed conversation between university students. Give punctuation and sentence endings their full conversational meaning. Carefully distinguish statements, questions, confirmation-seeking endings, and emotion—especially endings such as 痛い。 痛い？ 痛くないの？ 痛くないよね？ 会いたい。 and いたの？"
    : "Speak in natural, contemporary conversational Korean, as in a relaxed conversation between university students. Give punctuation and sentence-final endings their full conversational meaning—clearly distinguish casual 반말 endings, polite 해요체 endings, and formal 합쇼체 endings, as well as statements, questions, and confirmation-seeking or emotional endings, letting intonation follow the punctuation and emotional meaning naturally.";

  const characterDirection = voiceStyle === "neutral"
    ? "Keep the vocal character neutral, warm, and approachable."
    : voiceStyle === "masculine"
      ? "Use a subtly masculine contemporary vocal character. Keep it natural and avoid stereotypes, exaggeration, or performance-like affectation."
      : "Use a subtly feminine contemporary vocal character. Keep it natural and avoid stereotypes, exaggeration, or performance-like affectation.";

  const paceDirection = pace === "slow"
    ? "Speak a little slower for a language learner, but preserve natural phrase groups, reductions, linking, and intonation. Never separate words or syllables mechanically."
    : "Use an easy, natural conversational pace.";

  return `${languageDirection} ${characterDirection} ${paceDirection} Do not sound formal, instructional, theatrical, like an announcer, or like a textbook recording. Read only the provided text exactly as written; do not add, remove, translate, paraphrase, or explain anything.`;
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

  const { text, language, voiceStyle, pace } = body as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim() || text.length > 4096) {
    return NextResponse.json({ error: "Enter a phrase between 1 and 4096 characters." }, { status: 400 });
  }
  if (language !== "ja" && language !== "ko") {
    return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
  }
  if (voiceStyle !== "neutral" && voiceStyle !== "masculine" && voiceStyle !== "feminine") {
    return NextResponse.json({ error: "Unsupported voice style." }, { status: 400 });
  }
  if (pace !== "natural" && pace !== "slow") {
    return NextResponse.json({ error: "Unsupported speaking style." }, { status: 400 });
  }

  try {
    const speech = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: voices[voiceStyle],
        input: text,
        instructions: speakingInstructions(language, voiceStyle, pace),
        response_format: "mp3",
        speed: pace === "slow" ? 0.88 : 1,
      }),
    });

    if (!speech.ok) {
      const upstream = await speech.json().catch(() => null);
      console.error("OpenAI speech request failed", speech.status, upstream?.error?.message);
      return NextResponse.json({ error: "Speech generation failed. Please try again." }, { status: 502 });
    }

    return new Response(speech.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Speech generation error", error);
    return NextResponse.json({ error: "Could not reach the speech service." }, { status: 502 });
  }
}
