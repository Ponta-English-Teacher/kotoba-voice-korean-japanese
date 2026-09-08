# Kotoba Voice — Japanese × Korean

A minimal bilingual Japanese/Korean expression-learning and text-to-speech app built with Next.js and OpenAI APIs. Same-language input is spoken exactly as entered. Cross-language input produces three natural target-language alternatives for comparison before speaking the closest option.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your OpenAI API key.
3. Run `npm run dev` and open `http://localhost:3000`.

The browser sends expression-analysis requests to `/api/explain` and selected delivery controls to `/api/tts`. The API key and OpenAI requests remain server-side. The speech route returns MP3 audio directly to the browser.
