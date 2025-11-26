# Masquerade / Borealis Engine – Short Roadmap (EN)

## Phase 0 – Current Core (v1.6.1)

- Telegram bot with:
  - Nano Banana (Gemini 2.5 Flash Image) as default image engine.
  - Optional Gemini-3 Pro Image Preview via `!g3` flag.
  - Text-only Borealis description via `/borealis` command.
- Basic mode detection:
  - Outfit / collage mode.
  - Inspiration mode via `!inspire` / `!vibe`.
  - Text-only mode when no image is attached.
- `/api/outfit` JSON API:
  - Accepts `image_base64`, `brief`, `inspiration_mode`, `format`, `engine`.
  - Returns generated image (if any) + Borealis JSON block.
- Borealis description engine:
  - Title + description + 6 cultural references.
  - Formatting to Telegram-friendly Markdown.

## Phase 1 – Multi-Image & Parser

- Support multiple photos in one session:
  - User can send 2–6 images, then a text brief.
  - Engine treats them as one outfit (list of items) and generates a single look.
- Outfit Parser v2:
  - Detect basic item types: top, bottom, shoes, dress, bag, accessory.
  - Approximate style tags: street, casual, luxury, techwear, minimal, alt.
  - Extract rough color palette for the look (3 main colors).
- Remove `!model` mode in favor of proper multi-image flow.

## Phase 2 – Presets

- Add preset system with Telegram flags:
  - `!studio` – clean white studio / editorial.
  - `!lifestyle` – film-like street / soft grain.
  - `!ugc` – simple, softer lighting, phone-like.
  - `!lux` – luxury / magazine tone.
  - `!street` – darker streetwear mood.
- Internal preset format (examples under `presets/*.json`):
  - lighting / background
  - composition hints
  - Borealis tone / language hints
  - engine-specific params for Nano / G3
- `/preset` command:
  - Show available presets.
  - Set current preset for the user session.

## Phase 3 – Output / Text Experience

- Borealis formatting modes: Short / Medium / Long.
- Optional emoji and tiny section titles:
  - Vibe / Lines / Textures / Character / References.
- Auto-generated tags (3–6 tags like `urban`, `minimal`, `grunge`, `ugc`).
- Optional AI-credit footer:
  - “Generated with Masquerade Engine — AI-assisted fashion production.”
  - Toggle in future `/settings` (on/off).

## Phase 4 – Telegram UX v2

- New commands:
  - `/settings`, `/preset`, `/engine`, `/format`, `/language`.
- Better multi-image handling:
  - Images are buffered until a text message arrives.
  - `/clear` to flush buffered images.
- Simple stats in logs:
  - Which engines are used.
  - How many generations per user (for future Creator plans).

## Phase 5 – Infra & Stability

- Basic retry logic:
  - Gemini engines: up to 3 retries on transient errors.
  - Borealis (OpenAI): up to 2 retries.
- Light caching layer (in memory or Redis later):
  - Cache identical requests for a short time window.
- Structured error logging:
  - Model errors, timeouts, bad responses,
  - Telegram / HTTP failures.

## Phase 6 – Creator / Studio Future

- Creator-oriented positioning:
  - Tool for stylists, studios and brands,
  - Not a replacement for real photoshoots, but an AI-assisted layer.
- Future web Creator panel:
  - Look history, preset management, simple statistics.
- Future video direction:
  - Street-view-styled motion campaigns using Google View + Veo-based video generation.
  - Always with clear “AI-generated” labeling when used as campaign assets.
