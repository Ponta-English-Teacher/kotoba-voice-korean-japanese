"use client";

import { useEffect, useRef, useState } from "react";

type Language = "ja" | "ko";
type VoiceStyle = "neutral" | "masculine" | "feminine";
type Pace = "natural" | "slow";
type Stage = "explore" | "practice";
type Status = "idle" | "loading" | "playing" | "error";
type Alternative = {
  role: "close" | "natural" | "nuanced";
  expression: string;
  literal_meaning: string;
  natural_meaning: string;
  nuance: string;
  context: string;
  literal_translation: string;
};

const roleLabels: Record<Alternative["role"], string> = {
  close: "Close meaning",
  natural: "Natural & casual",
  nuanced: "Different nuance",
};

const NUANCE_TAG_VOCAB: { label: string; pattern: RegExp }[] = [
  { label: "Casual", pattern: /\bcasual(ly)?\b/i },
  { label: "Formal", pattern: /\bformal(ly)?\b/i },
  { label: "Polite", pattern: /\bpolite(ly)?\b/i },
  { label: "Blunt", pattern: /\bblunt(ly)?\b/i },
  { label: "Direct", pattern: /\bdirect(ly)?\b/i },
  { label: "Indirect", pattern: /\bindirect(ly)?\b/i },
  { label: "Softer", pattern: /\bsoft(er|ly)?\b/i },
  { label: "Stronger", pattern: /\bstrong(er|ly)?\b/i },
  { label: "Teasing", pattern: /\bteasing\b/i },
  { label: "Playful", pattern: /\bplayful(ly)?\b/i },
  { label: "Younger speech", pattern: /\byounger\b|\byouthful\b/i },
  { label: "Affectionate", pattern: /\baffectionate(ly)?\b/i },
  { label: "Gentle", pattern: /\bgentle(r|ly)?\b/i },
  { label: "Sarcastic", pattern: /\bsarcastic(ally)?\b/i },
  { label: "Respectful", pattern: /\brespectful(ly)?\b/i },
  { label: "Hesitant", pattern: /\bhesitant(ly)?\b/i },
  { label: "Confident", pattern: /\bconfident(ly)?\b/i },
  { label: "Urgent", pattern: /\burgent(ly)?\b/i },
  { label: "Concerned", pattern: /\bconcerned\b/i },
  { label: "Surprised", pattern: /\bsurprised?\b/i },
  { label: "Doubtful", pattern: /\bdoubtful\b/i },
];

function extractNuanceTags(...texts: string[]): string[] {
  const combined = texts.join(" ");
  const tags = NUANCE_TAG_VOCAB.filter(({ pattern }) => pattern.test(combined)).map(({ label }) => label);
  return [...new Set(tags)];
}

function Choice<T extends string>({ value, current, onSelect, children }: {
  value: T;
  current: T;
  onSelect: (value: T) => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={value === current ? "choice active" : "choice"} aria-pressed={value === current} onClick={() => onSelect(value)}>
      {children}
    </button>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("explore");
  const [inputLanguage, setInputLanguage] = useState<Language>("ja");
  const [targetLanguage, setTargetLanguage] = useState<Language>("ko");
  const [phrase, setPhrase] = useState("");
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [alternativesLanguage, setAlternativesLanguage] = useState<Language>("ja");
  const [practiceMeaning, setPracticeMeaning] = useState("");
  const [practiceNuance, setPracticeNuance] = useState("");
  const [practiceContext, setPracticeContext] = useState("");
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("neutral");
  const [pace, setPace] = useState<Pace>("natural");
  const [status, setStatus] = useState<Status>("idle");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const isSameLanguage = inputLanguage === targetLanguage;
  const targetName = targetLanguage === "ja" ? "Japanese" : "Korean";
  const literalLanguage: Language = alternativesLanguage === "ja" ? "ko" : "ja";
  const literalLabel = literalLanguage === "ja" ? "Literal Japanese" : "Literal Korean";

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  async function speak(text: string, key: string, language = targetLanguage) {
    setStatus("loading");
    setPlayingKey(null);
    setError("");
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language, voiceStyle, pace }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "Could not create speech. Please try again.");
    }

    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrlRef.current);
    audioRef.current = audio;
    audio.onended = () => {
      setStatus("idle");
      setPlayingKey(null);
    };
    audio.onerror = () => {
      setStatus("error");
      setPlayingKey(null);
      setError("The audio could not be played.");
    };
    // Flip to "playing" as soon as playback is requested rather than waiting on the
    // play() promise to settle: some browsers leave it pending well after audio has
    // audibly started, which would otherwise strand the UI on "loading" indefinitely.
    setPlayingKey(key);
    setStatus("playing");
    await audio.play();
  }

  async function explorePhrase() {
    const exactPhrase = phrase;
    if (!exactPhrase.trim() || status === "loading") return;
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setPlayingKey(null);
    setError("");
    setAlternatives([]);

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: exactPhrase, inputLanguage, targetLanguage }),
      });
      if (requestId !== requestIdRef.current) return;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not analyze this expression. Please try again.");
      }

      const result = await response.json();
      if (isSameLanguage) {
        if (!result.same_language) throw new Error("The phrase language could not be confirmed.");
        setPhrase(exactPhrase);
        setPracticeMeaning(result.meaning);
        setPracticeNuance(result.nuance);
        setPracticeContext(result.situation);
        setStage("practice");
      } else {
        if (result.same_language) throw new Error("The input already appears to be in the selected target language.");
        const roleOrder: Alternative["role"][] = ["close", "natural", "nuanced"];
        const nextAlternatives = (result.alternatives as Alternative[])
          .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
        setAlternatives(nextAlternatives);
        setAlternativesLanguage(targetLanguage);
      }
      setStatus("idle");
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  async function listenToAlternative(alternative: Alternative, index: number) {
    try {
      await speak(alternative.expression, `alternative-${index}`, alternativesLanguage);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  function useAlternative(alternative: Alternative) {
    requestIdRef.current += 1;
    setPhrase(alternative.expression);
    setPracticeMeaning(alternative.natural_meaning);
    setPracticeNuance(alternative.nuance);
    setPracticeContext(alternative.context);
    setError("");
    setStage("practice");
  }

  function changeInputLanguage(language: Language) {
    requestIdRef.current += 1;
    setInputLanguage(language);
    setAlternatives([]);
    setError("");
    if (status === "loading") setStatus("idle");
  }

  function changeTargetLanguage(language: Language) {
    requestIdRef.current += 1;
    setTargetLanguage(language);
    setAlternatives([]);
    setError("");
    if (status === "loading") setStatus("idle");
  }

  const nuanceTags = extractNuanceTags(practiceNuance, practiceMeaning);

  async function playPracticePhrase() {
    try {
      await speak(phrase, "practice", targetLanguage);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  return (
    <main>
      <div className="shell">
        <header>
          <div className="brand-mark" aria-hidden="true">こ</div>
          <div>
            <h1>Kotoba Voice</h1>
            <p>Japanese × Korean · Find the words. Make them yours.</p>
          </div>
          <div className="stage-indicator" aria-label={`Stage: ${stage}`}>
            <span className={stage === "explore" ? "current" : "done"}>1 Explore</span>
            <i />
            <span className={stage === "practice" ? "current" : ""}>2 Practice</span>
          </div>
        </header>

        {stage === "explore" ? (
          <>
            <section className="card explore-card" aria-labelledby="explore-title">
              <div className="section-title">
                <span className="stage-number">01</span>
                <div><span className="eyebrow">Explore</span><h2 id="explore-title">What do you want to say?</h2></div>
              </div>

              <div className="explore-language">
                <div className="language-pair">
                  <div className="language-select">
                    <span className="eyebrow">Input language</span>
                    <div className="segmented language-toggle">
                      <Choice value="ja" current={inputLanguage} onSelect={changeInputLanguage}>日本語</Choice>
                      <Choice value="ko" current={inputLanguage} onSelect={changeInputLanguage}>한국어</Choice>
                    </div>
                  </div>
                  <span className="direction-arrow" aria-hidden="true">→</span>
                  <div className="language-select">
                    <span className="eyebrow">Target language</span>
                    <div className="segmented language-toggle">
                      <Choice value="ja" current={targetLanguage} onSelect={changeTargetLanguage}>日本語</Choice>
                      <Choice value="ko" current={targetLanguage} onSelect={changeTargetLanguage}>한국어</Choice>
                    </div>
                  </div>
                </div>
                <span className="casual-badge"><span /> Natural conversation</span>
              </div>

              <label className="field phrase-field">
                <span>Your idea or phrase</span>
                <textarea
                  value={phrase}
                  maxLength={4096}
                  onChange={(event) => {
                    requestIdRef.current += 1;
                    setPhrase(event.target.value);
                    if (status === "loading") setStatus("idle");
                  }}
                  placeholder={inputLanguage === "ja" ? "日本語で入力…" : "한국어로 입력…"}
                  lang={inputLanguage}
                  rows={3}
                />
                <small>{phrase.length} / 4096</small>
              </label>

              <button className="play-button explore-action" type="button" onClick={explorePhrase} disabled={!phrase.trim() || status === "loading"}>
                <span className={status === "loading" ? "play-icon loading" : "play-icon"} aria-hidden="true">{status === "loading" ? "" : isSameLanguage ? "▶" : "✦"}</span>
                {status === "loading"
                  ? isSameLanguage ? "Preparing your phrase…" : "Finding natural expressions…"
                  : isSameLanguage ? "Hear this phrase" : `Find natural ${targetName} expressions`}
              </button>
              <div className="status" aria-live="polite">{error && <p className="error">{error}</p>}</div>
            </section>

            {alternatives.length > 0 && (
              <section className="alternatives-section" aria-labelledby="alternatives-title">
                <div className="alternatives-heading">
                  <div><span className="eyebrow">Choose your expression</span><h2 id="alternatives-title">Three natural ways to say it</h2></div>
                  <p>Natural expressions may differ from a literal translation.</p>
                </div>
                <div className="alternatives-list">
                  {alternatives.map((alternative, index) => (
                    <article className="alternative-row" key={`${alternative.role}-${alternative.expression}`}>
                      <div className="alternative-copy">
                        <span className={`role-badge ${alternative.role}`}>{roleLabels[alternative.role]}</span>
                        <p className="alternative-expression" lang={alternativesLanguage}>{alternative.expression}</p>
                        {alternative.literal_translation && (
                          <>
                            <span className="alternative-literal-label">{literalLabel}</span>
                            <p className="alternative-literal" lang={literalLanguage}>{alternative.literal_translation}</p>
                          </>
                        )}
                        <p className="alternative-explanation">{alternative.natural_meaning} {alternative.nuance}</p>
                      </div>
                      <div className="alternative-actions">
                        <button type="button" className="mini-play" onClick={() => listenToAlternative(alternative, index)} disabled={status === "loading"}>
                          {playingKey === `alternative-${index}` ? "Playing…" : "▶ Listen"}
                        </button>
                        <button type="button" className="use-button" onClick={() => useAlternative(alternative)}>Use this</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="card practice-card" aria-labelledby="practice-title">
            <div className="section-title">
              <span className="stage-number">02</span>
              <div><span className="eyebrow">Practice</span><h2 id="practice-title">Make it sound natural</h2></div>
            </div>

            <div className="practice-phrase-wrap">
              <span className="eyebrow">Your expression</span>
              <p className="practice-phrase" lang={targetLanguage}>{phrase}</p>

              <div className="practice-support">
                {practiceMeaning && (
                  <div className="support-block support-meaning">
                    <span className="support-label">Meaning</span>
                    <p className="support-text support-meaning-text">{practiceMeaning}</p>
                  </div>
                )}

                {(practiceNuance || nuanceTags.length > 0) && (
                  <div className="support-block support-nuance">
                    <span className="support-label">Connotation</span>
                    {nuanceTags.length > 0 && (
                      <div className="nuance-tags">
                        {nuanceTags.map((tag) => <span className="nuance-tag" key={tag}>{tag}</span>)}
                      </div>
                    )}
                    {practiceNuance && <p className="support-text support-nuance-text">{practiceNuance}</p>}
                  </div>
                )}

                {practiceContext && (
                  <div className="support-block support-context">
                    <span className="support-label">Context</span>
                    <p className="support-text support-context-text">{practiceContext}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="options-grid practice-options">
              <fieldset>
                <legend>Voice</legend>
                <div className="segmented three">
                  <Choice value="neutral" current={voiceStyle} onSelect={setVoiceStyle}>Neutral</Choice>
                  <Choice value="masculine" current={voiceStyle} onSelect={setVoiceStyle}>Masculine</Choice>
                  <Choice value="feminine" current={voiceStyle} onSelect={setVoiceStyle}>Feminine</Choice>
                </div>
              </fieldset>
              <fieldset>
                <legend>Speaking</legend>
                <div className="segmented">
                  <Choice value="natural" current={pace} onSelect={setPace}>Natural</Choice>
                  <Choice value="slow" current={pace} onSelect={setPace}>Slow</Choice>
                </div>
              </fieldset>
            </div>

            <button className="play-button" type="button" onClick={playPracticePhrase} disabled={status === "loading"}>
              <span className={status === "loading" ? "play-icon loading" : "play-icon"} aria-hidden="true">{status === "loading" ? "" : "▶"}</span>
              {status === "loading" ? "Creating speech…" : playingKey === "practice" ? "Playing…" : "Play phrase"}
            </button>
            <button className="compare-button" type="button" onClick={() => { setError(""); setStage("explore"); }}>← Compare other expressions</button>
            <div className="status" aria-live="polite">{error && <p className="error">{error}</p>}</div>
          </section>
        )}
        <footer className="app-footer">Hitoshi Eguchi · Hokusei Gakuen University</footer>
      </div>
    </main>
  );
}
