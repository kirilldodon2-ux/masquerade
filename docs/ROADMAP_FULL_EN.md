Masquerade / Borealis Engine — Full Roadmap (EN)

Last updated: v1.6.1 → preparing v1.7.0–2.1.0

This roadmap defines the full development path of the Masquerade Engine — from the current Telegram-based MVP to a modular creative engine powering AI-assisted styling, campaign visuals, presets, and (later) Atlas-style pipeline orchestration.

The document is Codex-friendly: every block can be converted into a development task.

⸻

PHASE 0 — Current Core (v1.6.1)

Already implemented:
	•	Telegram bot with:
	•	Nano Banana (Gemini 2.5 Flash Image) as default engine.
	•	Optional Gemini-3 Pro Image Preview via !g3 flag.
	•	Text-only Borealis description via /borealis.
	•	Mode detection:
	•	Outfit / collage
	•	Inspiration mode (!inspire, !vibe)
	•	Text-only when no image attached.
	•	/api/outfit HTTP JSON API:
	•	Accepts image_base64, brief, inspiration_mode, format, engine.
	•	Returns generated image + Borealis block.
	•	Borealis output:
	•	Title, description, 6 references.
	•	Telegram-ready Markdown formatting.

⸻

PHASE 1 — Multi-Image Input & Outfit Parser v2 (v1.7.x)

1.1 Multi-image support
	•	User may send 2–6 images before sending a text brief.
	•	All images form one semantic input (one outfit / one collage).
	•	Buffer images until text arrives.

1.2 Unified internal model

type OutfitInput = {
  items: ImageRef[];
  bodyRefs?: ImageRef[];
  bgRefs?: ImageRef[];
  flags: { nano?: boolean; g3?: boolean };
  preset?: string;
};

1.3 Outfit Parser v2
	•	Detect item types: top, bottom, outerwear, shoes, bag, accessory.
	•	Estimate style tags: street, alt, luxury, techwear, minimal.
	•	Extract color palette (3 colors).

1.4 Remove !model
	•	Replaced by proper multi-image flow.

⸻

PHASE 2 — Preset System (v1.8.x)

2.1 Preset flags in Telegram
	•	!studio — clean editorial white
	•	!lifestyle — film-like street
	•	!ugc — phone-like, soft
	•	!lux — luxury magazine
	•	!street — darker streetwear

2.2 Internal preset JSON format

{
  "name": "studio",
  "lighting": "soft studio",
  "background": "white",
  "composition": "medium shot, centered",
  "tone": "editorial",
  "engine": {
    "nano": { "detail": 0.4 },
    "g3":   { "depth": 0.2 }
  }
}

2.3 /preset
	•	Show list of presets.
	•	Allow user to set preset for session.

⸻

PHASE 3 — Output / Text Experience (v1.9.x)

3.1 Borealis modes
	•	Short / Medium / Long.

3.2 Optional micro-sections
	•	Vibe
	•	Lines
	•	Textures
	•	Character
	•	References

3.3 Auto-tags (3–6)

Generated from parser and Borealis tone.

3.4 Optional footer

“Generated with Masquerade Engine — AI-assisted fashion production.”

⸻

PHASE 4 — Telegram UX v2 (v1.10.x)

4.1 New UX commands
	•	/settings
	•	/preset
	•	/engine (Nano/G3 default)
	•	/format
	•	/language
	•	/clear (flush buffered images)

4.2 Buffering system
	•	Hold images until text brief arrives.
	•	Time-based expiry (e.g. 90 sec).

4.3 Logging
	•	Usage per user
	•	Engine distribution
	•	Generation statistics (basic)

⸻

PHASE 5 — Infra & Stability (v1.11.x)

5.1 Retries
	•	Gemini engines: 3
	•	Borealis (OpenAI): 2

5.2 Light caching
	•	In-memory, Redis in future.

5.3 Structured error logging
	•	Timeouts
	•	Model errors
	•	Telegram failures
	•	HTTP exceptions

⸻

PHASE 6 — Creator / Studio Future (v2.0.x)

6.1 Creator positioning
	•	Tool for stylists, studios, fashion creators.
	•	Complements real photoshoots.

6.2 Web Creator Panel
	•	History of looks
	•	Preset manager
	•	Simple stats

6.3 Video / motion (future)
	•	Google Street View → Veo-based motion campaigns.
	•	Emphasis on transparency (“AI-generated”).

⸻

PHASE 7 — Campaign Mode (Dima’s Brand) (v2.1.x)

7.1 Campaign model

CampaignSession {
  id: string;
  brand: string;
  mood: string[];
  locations: ImageRef[];
  outfits: ImageRef[];
}

7.2 Pipeline
	•	Input:
	•	Street View locations
	•	AI Fashion Labs outfits
	•	Engine:
	•	Masquerade multi-input
	•	Preset applied (e.g. diesel-absurd)
	•	Output:
	•	Campaign images + captions
	•	Export folder structure
	•	Metadata JSON for each scene

⸻

PHASE 8 — Atlas Pipeline (v2.x FUTURE, NOT NOW)

High-level architecture only, no implementation now.

Modules:
	•	ingest (Telegram/Web/Figma)
	•	style-engine (Nano/G3 + Borealis)
	•	campaign-orchestrator
	•	storage/export

⸻

Codex Usage Guide

When using Codex / VS Code:
	•	Convert each bullet into a task:
TASK 1.1: implement OutfitInput buffering
TASK 2.1: create preset loader
TASK 3.3: add auto-tags system
	•	Always specify which file to edit.
	•	Only one task per request.
	•	Reference this roadmap for context.

⸻

END OF DOCUMENT
