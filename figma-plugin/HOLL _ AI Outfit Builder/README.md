# HÓLL — AI Outfit Builder (Figma Plugin)

HÓLL — это Figma-плагин поверх Masquerade Engine:  
из выбранного в Figma коллажа вещей он собирает готовый look на модели + editorial-описание от Borealis.

Плагин идеально подходит для fashion-студий, стилистов и e-commerce команд, которым нужен быстрый AI-стайлинг без ручного композа в Photoshop.

---

## What it does

From a selected frame in Figma:

1. Exports the selection as a JPEG collage.
2. Sends it to Masquerade `/api/outfit`.
3. Receives:
   - generated outfit image (`image_base64`)
   - Borealis description (`title`, `description`, `references[]`)
4. Places a new rectangle with the ready look on the canvas.
5. Shows the Borealis text in the plugin UI.

---

## Stack

- **Figma plugin**: vanilla JS, no bundler.
- **Backend**: Masquerade / Borealis Engine (Node.js, Express).
- **Models**:
  - Google Vertex AI (Gemini image models)
  - OpenAI Responses API (Borealis editorial engine).

---

## Requirements

- Figma desktop or browser with **Dev Mode**.
- Running Masquerade backend with endpoint:

  ```http
  POST /api/outfit

Body:

{
  "image_base64": "<jpeg base64>",
  "brief": "optional stylist text",
  "inspiration_mode": false,
  "format": "3x4 | 9x16 | 16x9",
  "engine": "nano | g3"
}

Response:

{
  "mode": "OUTFIT_ONLY",
  "engine": "nano",
  "borealis": {
    "title": "...",
    "description": "...",
    "references": ["...", "..."]
  },
  "image_base64": "<jpeg base64 or null>"
}


⸻

Setup

1. Backend URL

In figma-plugin/HÓLL__AI Outfit Builder/code.js set your Masquerade host:

const MASQUERADE_BASE_URL = "https://YOUR-MASQUERADE-HOST.com";

The plugin will call ${MASQUERADE_BASE_URL}/api/outfit.

The same host must be added to manifest.json → networkAccess.allowedDomains.

2. Install plugin in Figma
	1.	Open Figma → Plugins → Development → Import plugin from manifest…
	2.	Select manifest.json from figma-plugin/HÓLL__AI Outfit Builder.
	3.	Plugin will appear under Plugins → Development → HÓLL — AI Outfit Builder.

⸻

Usage
	1.	In your Figma file, create a frame with:
	•	product images / collage,
	•	or moodboard you want to use as inspiration.
	2.	Select this frame.
	3.	Run HÓLL — AI Outfit Builder from the Plugins menu.
	4.	In the plugin panel:
	•	Write a short stylist brief / vibe (optional).
	•	Choose Mode:
	•	Outfit from collage — use items as they are.
	•	Inspiration / moodboard — treat the image as mood only.
	•	Choose Engine:
	•	Nano Banana (Gemini 2.5 Flash Image).
	•	Gemini-3 Image (experimental).
	•	Optionally set aspect: Auto, 3×4, 9×16, 16×9.
	5.	Click Generate from selection.
	6.	Plugin will:
	•	place a new rectangle with the ready look next to your frame,
	•	show Borealis text + cultural references in the panel.

⸻

Roadmap / Ideas
	•	Text layer with Borealis description directly on the canvas.
	•	Preset scenes (studio / dark parking / lookbook).
	•	Batch generation for multiple artboards.
	•	Direct integration with e-commerce feeds / CMS.

⸻

Notes

This plugin is a thin client over Masquerade / Borealis Engine.
All heavy lifting (AI calls, composition logic, editorial text) happens on the backend, so the plugin can be safely used inside production Figma workflows.