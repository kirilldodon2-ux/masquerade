// src/index.js
// Masquerade / Borealis Engine v1.6.2

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import FormData from "form-data";
import {
  buildOutfitInputFromTelegram,
  runOutfitPipelineFromOutfitInput,
} from "./core/outfit-pipeline.js";
import {
  createEmptyOutfitInput,
  addImageToOutfitInput,
  attachBrief,
} from "./core/outfit-input.js";

const app = express();

// ✅ CORS для Figma / браузера
app.use((req, res, next) => {
  // Разрешаем любые origin — нам ок, API приватное по URL/ключам
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Разрешённые методы
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  // Разрешённые заголовки
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Быстрый ответ на preflight, чтобы Figma/браузер не падали
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(bodyParser.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8080;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const telegramImageBuffer = new Map();

// ----------- webhook dedup + text clamp -----------

const processedUpdates = new Map(); // key -> timestamp
const DEDUP_TTL_MS = 5 * 60 * 1000;

function isDuplicate(key) {
  const now = Date.now();
  // cleanup old keys
  for (const [k, ts] of processedUpdates) {
    if (now - ts > DEDUP_TTL_MS) processedUpdates.delete(k);
  }
  if (processedUpdates.has(key)) return true;
  processedUpdates.set(key, now);
  return false;
}

function clampText(text, maxLen) {
  const t = String(text || "").trim();
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, Math.max(0, maxLen - 1));
  const cut = slice.lastIndexOf("\n");
  return (cut > 200 ? slice.slice(0, cut) : slice) + "…";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

// ----------- basic sanity logs -----------

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing");
} else {
  console.log("TELEGRAM_BOT_TOKEN: ✅ loaded");
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing");
}
if (!VERTEX_API_KEY) {
  console.error("❌ VERTEX_API_KEY is missing");
}

console.log("Masquerade booting…");

// ======================================================
// 1. Telegram helpers
// ======================================================

/**
 * Send a Telegram message with HTML formatting and web page preview disabled by default.
 * To override preview, pass { disable_web_page_preview: false } in extra.
 */
async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  };

  try {
    const resp = await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    if (!resp.data.ok) {
      console.error("Telegram sendMessage error:", resp.data);
    } else {
      console.log("📤 Message sent to chat", chatId);
    }
  } catch (err) {
    console.error(
      "Failed to call Telegram sendMessage:",
      err?.response?.data || err
    );
  }
}

async function sendTelegramPhoto(chatId, imageBuffer, caption) {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", imageBuffer, {
      filename: "outfit.jpg",
      contentType: "image/jpeg",
    });

    const resp = await axios.post(`${TELEGRAM_API}/sendPhoto`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });

    if (!resp.data.ok) {
      console.error("Telegram sendPhoto error:", resp.data);
    } else {
      console.log("📤 Photo sent to chat", chatId);
    }
  } catch (err) {
    console.error(
      "Failed to call Telegram sendPhoto:",
      err?.response?.data || err
    );
  }
}

/**
 * Download largest photo variant from Telegram message.
 */
async function downloadTelegramPhoto(message) {
  const photos = message.photo;
  if (!photos || !photos.length) {
    throw new Error("No photo array in message");
  }

  const largest = photos[photos.length - 1];
  const fileId = largest.file_id;
  if (!fileId) throw new Error("photo.file_id missing");

  const fileResp = await axios.get(`${TELEGRAM_API}/getFile`, {
    params: { file_id: fileId },
  });

  const filePath = fileResp.data?.result?.file_path;
  if (!filePath) {
    console.error("getFile response:", fileResp.data);
    throw new Error("Telegram getFile did not return file_path");
  }

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

  const fileBinResp = await axios.get(fileUrl, {
    responseType: "arraybuffer",
  });

  const buffer = Buffer.from(fileBinResp.data);

  console.log("📥 Telegram photo downloaded:", { fileId, filePath });

  return { fileId, filePath, buffer };
}

// ======================================================
// 2. Telegram image buffer (multi-image)
// ======================================================

function getBestPhotoVariant(photos = []) {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  return photos[photos.length - 1];
}

function appendPhotoToBuffer(chatId, photo) {
  if (!chatId || !photo) return;
  const existing = telegramImageBuffer.get(chatId) || [];
  telegramImageBuffer.set(chatId, [...existing, photo]);
}

function consumeBufferedPhotos(chatId) {
  if (!chatId) return [];
  const photos = telegramImageBuffer.get(chatId) || [];
  telegramImageBuffer.delete(chatId);
  return photos;
}

function clearBufferedPhotos(chatId) {
  if (!chatId) return;
  telegramImageBuffer.delete(chatId);
}

// ======================================================
// 3. Aspect ratio helpers (3×4 / 9×16 / 16×9)
// ======================================================

const DEFAULT_ASPECT_HINT = "vertical 3:4, high resolution";

/**
 * Parse aspect from brief text (RU/EN hints) or fallback to default.
 */
function detectAspectHintFromBrief(briefText) {
  if (!briefText) return DEFAULT_ASPECT_HINT;
  const t = briefText.toLowerCase();

  // вертикальные сторис 9×16
  if (
    t.includes("9x16") ||
    t.includes("9:16") ||
    t.includes("stories") ||
    t.includes("story") ||
    t.includes("сторис") ||
    t.includes("вертикал")
  ) {
    return "vertical 9:16, high resolution";
  }

  // горизонтальный 16×9
  if (
    t.includes("16x9") ||
    t.includes("16:9") ||
    t.includes("landscape") ||
    t.includes("горизонт")
  ) {
    return "horizontal 16:9, high resolution";
  }

  // 3×4 / 4:3
  if (
    t.includes("3x4") ||
    t.includes("3:4") ||
    t.includes("4x3") ||
    t.includes("4:3")
  ) {
    return "vertical 3:4, high resolution";
  }

  // дефолт: “аутфитный” вертикальный 3:4
  return DEFAULT_ASPECT_HINT;
}

/**
 * Optional explicit format from API: "3x4" | "9x16" | "16x9".
 * (для /api/outfit, если захочешь формат прокидывать полем format)
 */
function getAspectHintFromFormat(format) {
  if (!format) return null;
  const f = String(format).toLowerCase();

  if (f === "9x16" || f === "9:16") {
    return "vertical 9:16, high resolution";
  }
  if (f === "16x9" || f === "16:9") {
    return "horizontal 16:9, high resolution";
  }
  if (f === "3x4" || f === "3:4" || f === "4x3" || f === "4:3") {
    return "vertical 3:4, high resolution";
  }

  return null;
}

// ======================================================
// 4. Gemini image engines (Nano Banana + Gemini 3)
// ======================================================

/**
 * Общий билдер промпта и payload для Gemini-изображений.
 * Используется и Nano Banana, и Gemini-3.
 */
function buildGeminiImagePayload(buffer, briefText = "", options = {}) {
  const { inspirationMode = false, aspectHintOverride = null } = options;

  const base64 = buffer.toString("base64");
  const brief = (briefText || "").trim();

  const aspectHint =
    aspectHintOverride != null
      ? aspectHintOverride
      : detectAspectHintFromBrief(brief);

  const aspectLine = aspectHint
    ? `

Output requirements:
- image aspect: ${aspectHint}
- keep details sharp and clean, high resolution.`
    : "";

  const absoluteConstraints = `
ABSOLUTE CONSTRAINTS (MANDATORY):
- DO NOT invent new garments.
- DO NOT change cuts, materials, proportions, stitching, prints, or length.
- DO NOT introduce new colors.
- DO NOT stylize, redesign, or reinterpret the items.
- Every garment MUST appear exactly as in the collage.
- No smoothing, redesigning, stylization, or reshaping of clothing.
`;

  const baseInstruction = inspirationMode
    ? `You are a fashion concept engine.
Use this image as pure visual inspiration: colors, shapes, textures, composition, mood.
Design a NEW outfit on a single standing human model based on this mood.

The model:
- full-body, front-facing or 3/4
- calm, neutral pose
- no dynamic action, no extreme angles.

Background and light:
- unless the stylist brief explicitly requests a specific place or environment,
  always render in a clean photo studio: plain white cyclorama background,
  soft even lighting, no props, no scenery, no extra characters.

Clothing:
- translate motifs from the image into clothing and accessories,
  but do NOT literally redraw non-fashion objects from the picture.${aspectLine}
${absoluteConstraints}`
    : `You are a fashion virtual try-on engine.
Take this collage of CLOTHING items and dress a single standing human model
in these exact clothes and accessories.

Clothing:
- do NOT change design, cut, prints, logos or colors of the garments
- do NOT add random extra items unless the stylist brief clearly asks for it.

Model:
- the person must match the stylist brief description (gender, age, hair, beard,
  proportions, vibe) as closely as possible
- do not replace them with another random model.

Framing and background:
- show the model full-body, front-facing or 3/4, in a calm neutral pose
- do not crop the head or feet
- unless the stylist brief explicitly asks for another location,
  always render on a plain white studio cyclorama background with soft even light
  (no streets, no interiors, no props, no extra people).${aspectLine}
${absoluteConstraints}`;

  const textPrompt = brief
    ? `${baseInstruction}\n\nStylist brief: ${brief}`
    : baseInstruction;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: textPrompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64,
            },
          },
        ],
      },
    ],
  };

  return body;
}

async function callGeminiImageAPI(modelId, body) {
  if (!VERTEX_API_KEY) {
    console.warn("VERTEX_API_KEY is missing, skipping Gemini image call");
    return null;
  }

  const url =
    "https://aiplatform.googleapis.com/v1/" +
    `publishers/google/models/${modelId}:generateContent` +
    `?key=${VERTEX_API_KEY}`;

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    maxBodyLength: Infinity,
  });

  function findInlineData(node) {
    if (!node || typeof node !== "object") return null;
    if (node.inline_data?.data) return node.inline_data;
    if (node.inlineData?.data) return node.inlineData;
    for (const val of Object.values(node)) {
      const found = findInlineData(val);
      if (found) return found;
    }
    return null;
  }

  const inline = findInlineData(resp.data);
  if (!inline?.data) {
    console.error("Gemini image response without inline_data:", resp.data);
    throw new Error("No Base64 image in Gemini image response");
  }

  return Buffer.from(inline.data, "base64");
}

// Default engine: Nano Banana (gemini-2.5-flash-image)
async function generateNanoBananaImage(buffer, briefText = "", options = {}) {
  const body = buildGeminiImagePayload(buffer, briefText, options);
  const buf = await callGeminiImageAPI("gemini-2.5-flash-image", body);
  console.log("🟡 Nano Banana (Gemini 2.5 Flash Image) generated");
  return buf;
}

// Experimental engine: Gemini-3 Pro Image Preview
async function generateGemini3Image(buffer, briefText = "", options = {}) {
  const body = buildGeminiImagePayload(buffer, briefText, options);
  const buf = await callGeminiImageAPI("gemini-3-pro-image-preview", body);
  console.log("🔵 Gemini 3 Pro Image generated");
  return buf;
}

// ======================================================
// 5. Borealis description (OpenAI Responses)
// ======================================================

async function generateBorealisDescription({
  filePath = null,
  briefText = "",
  imageBase64 = null,
}) {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY missing, skipping Borealis description");
    return {
      title: "Готовый образ",
      description: "",
      references: [],
    };
  }

  let imageUrl = null;

  if (imageBase64) {
    // generic API / Figma / etc
    imageUrl = `data:image/jpeg;base64,${imageBase64}`;
  } else if (filePath) {
    // Telegram
    imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  }

  const systemPrompt = `
You are BOREALIS EDITORIAL ENGINE 1.1 — a high-precision fashion narrator combining
OpenAI clarity, Margiela restraint, Kojima introspection and archival fashion culture.

Your task: создать атмосферное, кинематографичное описание образа + ровно ШЕСТЬ архивных отсылок
на основе референс-лука пользователя (фото / коллаж / модель).

ГЛАВНОЕ:
— Ты описываешь СОСТОЯНИЕ персонажа через одежду.
— Фокус на аутфите: силуэт, линии, ритм, фактуры, пластика.
— Фон и стиль иллюстрации можно упоминать только как мягкий контекст, а не как главную тему.

Тон Borealis:
— тихая уверенность
— лаконичность
— интеллектуальная эстетика
— холодная поэтичность
— минимализм с эмоциональным подтоном
— ощущение архитектуры, света, пространства
— модное ДНК будущего бренда

FORMAT OUTPUT (JSON ONLY):
{
  "title": string,
  "description": string,
  "references": string[]
}

RULES FOR DESCRIPTION:
— 4–6 предложений, русский язык
— не перечисляй предметы списком («куртка, брюки, шапка»)
— не используй каталоговый язык как основную ось описания
— не упоминай фото, ИИ, ботов, JSON, Telegram, нейросети
— описывай состояние и характер персонажа через свет, линию, силуэт, ритм, фактуру, движение, паузы
— структура: состояние → настроение → линии → фактуры → характер → финальная нота
— если фон важен, используй его как мягкий фон настроения, а не как главный сюжет
— одежду не выдумывай, детали не меняй, но трактуй их эмоционально
— избегай пустых клише вроде «в этом образе ощущается», «в этом луке прослеживается»
— начинай фразы конкретнее: с действия, состояния, света, жеста или пространства
— предложения держи собранными: без многословия и повторов

RULES FOR REFERENCES (ВСЕГДА РОВНО 6 ШТУК):
Массив "references" ДОЛЖЕН содержать ровно 6 строк.

3 строки — МОДА:
  — реальные дизайнеры, дома, эпохи, направления
  — максимум 3–5 слов
  — без вымышленных имён и коллекций
  — если ты не уверен, используй обобщения вроде
    «японский стрит 2000-х», «европейский авангард 90-х».

2 строки — МУЗЫКА (ОБЯЗАТЕЛЬНО):
  — трек, альбом, артист или саундтрек
  — максимум 3–7 слов
  — пример: «Portishead — Dummy», «Radiohead — OK Computer», «Blade Runner OST, Vangelis»
  — выбирай то, что честно резонирует с образом по настроению и ритму.

1 строка — ШИРОКАЯ КУЛЬТУРА:
  — фильмы, аниме, сериалы, книги, субкультуры и т.п.
  — максимум 3–7 слов
  — если аутфит явно отсылает к известному тайтлу или фильму/сериалу (например, Paradise Kiss, Blade Runner, Neon Genesis Evangelion, Mr. Robot, Matrix),
    можно использовать его как одну из ссылок. 

Не повторяй одни и те же имена/тайтлы внутри массива.

Если сомневаешься в конкретном дизайнере или коллекции,
лучше дай более общий, но честный культурный или модный маркер,
чем выдуманную сущность.

RULES FOR TITLE:
— 2–5 слов, русский язык
— без кавычек внутри
— допускаются метафоры («Туманный рейдер мегаполиса», «Сахарный рок-стар»)
— не повторяй дословно текст описания
— избегай банальностей вроде «Этот образ... или Стильный городской образ»

COMMUNICATION RULES (VERY IMPORTANT):
— Ты НИКОГДА не задаёшь вопросы пользователю.
— Не просишь дополнительные данные.
— Если бриф пустой или информации мало — спокойно достраиваешь детали сам.
— Всегда возвращаешь только JSON-объект без пояснений и комментариев.

ЗОЛОТОЕ ПРАВИЛО:
Borealis описывает не одежду — а состояние.
Одежда — инструмент передачи внутреннего света персонажа.
`.trim();

  const brief = (briefText || "").trim();

  const briefBlock = brief
    ? `Стилевой бриф от пользователя (используй как контекст, не задавай уточняющих вопросов):\n${brief}\n`
    : `Стилевой бриф отсутствует. Не задавай вопросов и не проси дополнительных данных — аккуратно дострой недостающие детали сам.\n`;

  const baseIntro = imageUrl
    ? `У тебя есть пользовательский коллаж / фото с набором вещей для образа.`
    : `У тебя нет картинки, только текстовый контекст. Представь модный образ сам.`;

  const userText = `
${baseIntro}
${briefBlock}

На основе этого создай один цельный образ и верни только JSON в формате:
{ "title": "...", "description": "...", "references": ["...", "..."] }
в фирменном стиле Borealis, без каких-либо вопросов пользователю.
`.trim();

  const body = {
    model: "gpt-4.1",
    instructions: systemPrompt,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: userText },
          ...(imageUrl
            ? [
                {
                  type: "input_image",
                  image_url: imageUrl,
                },
              ]
            : []),
        ],
      },
    ],
    temperature: 0.9,
    text: {
      format: { type: "text" },
    },
  };

  const resp = await axios.post("https://api.openai.com/v1/responses", body, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    maxBodyLength: Infinity,
  });

  const output = resp.data?.output || [];
  const firstMessage = output[0] || {};
  const contentArr = firstMessage.content || [];
  const textItem = contentArr.find((c) => c.type === "output_text");
  const rawText = (textItem && textItem.text && textItem.text.trim()) || "";

  if (!rawText) {
    console.error("Borealis empty response:", resp.data);
    throw new Error("Borealis: empty text in Responses output");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      parsed = {
        title: "Готовый образ",
        description: rawText,
        references: [],
      };
    }
  }

  let title = parsed.title || "Готовый образ";
  let description = parsed.description || "";
  let references = Array.isArray(parsed.references)
    ? parsed.references
    : [];

  // Normalize references: non-empty, max 6
  references = references
    .filter((r) => typeof r === "string" && r.trim())
    .map((r) => r.trim());
  if (references.length > 6) {
    references = references.slice(0, 6);
  }

  console.log("🟣 Borealis description generated");

  return { title, description, references };
}

// ======================================================
// 6. Formatting for Telegram
// ======================================================

function formatBorealisMessage(modeLabel, borealis) {
  const titleRaw = (borealis.title || "Готовый образ").trim();
  const descRaw = (borealis.description || "").trim();
  const refsRaw = Array.isArray(borealis.references) ? borealis.references : [];

  const title = escapeHtml(titleRaw);
  const description = escapeHtml(descRaw);
  const refs = refsRaw
    .filter((r) => typeof r === "string" && r.trim())
    .map((r) => escapeHtml(r.trim()));

  const fashion = refs.slice(0, 3);
  const music = refs.slice(3, 5);
  const culture = refs.slice(5, 6);

  const DIVIDER = "⎯⎯⎯⎯⎯⎯⦿⎯⎯⎯⎯⎯⎯";

  // We keep everything максимально компактно: без пустых строк.
  const lines = [];

  // 1) Technical header as quote
  lines.push(`<blockquote>Mode: ${escapeHtml(modeLabel)}</blockquote>`);

  // 2) Title
  lines.push(`<b>${title}</b>`);

  // 3) Main description — always in quote (Telegram часто auto-collapses длинные цитаты)
  if (description) {
    lines.push(`<blockquote>${description}</blockquote>`);
  }

  // 4) References (compact, no "References:" label)
  const refLines = [];

  if (fashion.length) {
    refLines.push(`<b>Fashion</b>`);
    fashion.forEach((r) => refLines.push(`• ${r}`));
  }

  if (music.length) {
    refLines.push(`<b>Music</b>`);
    music.forEach((r) => refLines.push(`• ${r}`));
  }

  if (culture.length) {
    refLines.push(`<b>Culture</b>`);
    culture.forEach((r) => refLines.push(`• ${r}`));
  }

  if (refLines.length) {
    lines.push(DIVIDER);
    // refs keep normal flow (not quote) so they stay visible even when description collapses
    lines.push(refLines.join("\n"));
  }

  // Single-newline join => no blank lines
  return lines.filter(Boolean).join("\n");
}

// ======================================================
// 7. Mode detection
// ======================================================

function detectMode(message) {
  const hasPhoto = Boolean(message.photo && message.photo.length);

  if (!hasPhoto) {
    return "TEXT_ONLY";
  }

  // По умолчанию — считаем, что это коллаж / аутфит
  return "OUTFIT_ONLY";
}

// ======================================================
// 8. Core pipeline: buffer -> Gemini image + Borealis
// ======================================================

async function runOutfitPipeline({
  buffer,
  filePath = null,
  brief = "",
  inspirationMode = false,
  aspectHintOverride = null,
  engine = "nano", // "nano" | "g3"
  imageContextHint = "",
  parsedOutfit = null,
}) {
  // 1) Gemini image — визуал
  let nbImageBuffer = null;
  const briefForImage = imageContextHint
    ? `${brief || ""}\n\n${imageContextHint}`.trim()
    : brief;

  if (buffer) {
    try {
      if (engine === "g3") {
        nbImageBuffer = await generateGemini3Image(buffer, briefForImage, {
          inspirationMode,
          aspectHintOverride,
        });
      } else {
        nbImageBuffer = await generateNanoBananaImage(buffer, briefForImage, {
          inspirationMode,
          aspectHintOverride,
        });
      }
    } catch (err) {
      console.error("Gemini image error:", err?.response?.data || err);
      nbImageBuffer = null;
    }
  }

  // 2) Borealis — описание
  const imageBase64 = !filePath && buffer ? buffer.toString("base64") : null;

  const borealis = await generateBorealisDescription({
    filePath,
    briefText: brief,
    imageBase64,
  }).catch((err) => {
    console.error("Borealis error:", err?.response?.data || err);
    return {
      title: "Готовый образ",
      description: "",
      references: [],
    };
  });

  return { nbImageBuffer, borealis };
}

// ======================================================
// 9. Telegram handlers
// ======================================================

async function processBufferedOutfitInput({ chatId, text, photos }) {
  if (!photos || photos.length === 0) return false;

  const { outfitInput, inspirationMode, engine } = buildOutfitInputFromTelegram(
    {
      chatId,
      images: photos,
      text,
    }
  );

  console.log("🧺 Buffered input", {
    chatId,
    photos: photos.length,
    brief: (text || "").slice(0, 80),
  });

  const { nbImageBuffer, borealis } = await runOutfitPipelineFromOutfitInput(
    outfitInput,
    {
      inspirationMode,
      aspectHintOverride: null, // Telegram → формат из брифа / дефолт
      engine,
      chatId,
      downloadTelegramPhoto,
      runOutfitPipeline,
    }
  );

  const modeLabelBase = inspirationMode
    ? "Inspiration moodboard."
    : "Outfit / Collage.";
  const modeLabel =
    engine === "g3"
      ? `${modeLabelBase} Engine: Gemini-3.`
      : `${modeLabelBase} Engine: Nano Banana.`;

  let captionText = formatBorealisMessage(modeLabel, borealis);
  // Telegram limits: caption <= 1024, message <= 4096
  captionText = nbImageBuffer ? clampText(captionText, 1024) : clampText(captionText, 4096);

  if (nbImageBuffer) {
    await sendTelegramPhoto(chatId, nbImageBuffer, captionText);
  } else {
    await sendTelegramMessage(chatId, captionText);
  }

  return true;
}

async function handleOutfitOnly(message) {
  const chatId = message.chat.id;
  const bestPhoto = getBestPhotoVariant(message.photo);
  const hadBuffered = (telegramImageBuffer.get(chatId) || []).length > 0;

  if (bestPhoto) {
    appendPhotoToBuffer(chatId, bestPhoto);
  }

  const rawCaption = message.caption || message.text || "";

  if (rawCaption.trim()) {
    const bufferedPhotos = consumeBufferedPhotos(chatId);
    await processBufferedOutfitInput({
      chatId,
      text: rawCaption,
      photos: bufferedPhotos,
    });
    return;
  }

  if (!hadBuffered) {
    await sendTelegramMessage(
      chatId,
      "📸 Сохранил фото. Пришли ещё (до 6) и текстовый бриф — соберём образ."
    );
  }
}

/**
 * TEXT_ONLY: честный режим — бот ждёт картинку.
 * + dev-команда /borealis для текстового теста редактора.
 */
async function handleTextOnly(message) {
  const chatId = message.chat.id;
  const text = message.text || "";

  // --- commands (do not treat as text-only generation) ---

  if (text.startsWith("/start")) {
    const reply = [
      "🧥 *Borealis Masquerade онлайн.*",
      "",
      "Я собираю цельные образы из нескольких фото и короткого брифа.",
      "",
      "*Базовый флоу*:",
      "1) пришли 2–6 фото вещей (коллаж или отдельные кадры),",
      "2) потом пришли короткий текстовый бриф (vibe / история),",
      "3) я соберу один лук + Borealis-описание.",
      "",
      "*Режимы:*",
      "• без тегов — считаю, что это коллаж вещей.",
      "• `!inspire` / `!vibe` — картинка как moodboard, я придумываю look по мотивам.",
      "",
      "*Движок картинки:*",
      "• по умолчанию — Nano Banana (быстро, дешево).",
      "• добавить `!g3` — Gemini-3 Pro Image Preview.",
      "• добавить `!flash` или `!nano` — принудительно Nano Banana.",
      "",
      "Формат кадра можно подсказать в тексте брифа: `3x4`, `9x16` или `16x9`.",
      "",
      "Команды: /help, /clear (сбросить буфер фото).",
      "Тег `!model` больше не нужен — просто пришли фото вещей + бриф.",
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
    return;
  }

  if (text.startsWith("/help")) {
    const reply = [
      "Masquerade — fashion-intelligence engine.",
      "",
      "*Как со мной работать:*",
      "1) Пришли 2–6 фото вещей (коллаж или отдельные кадры).",
      "2) Потом пришли короткий текстовый бриф (vibe / история).",
      "3) Я соберу один лук, визуал и Borealis-описание.",
      "",
      "*Теги режимов:*",
      "• `!inspire` или `!vibe` — картинка как moodboard, я собираю look по мотивам.",
      "",
      "*Теги движка:*",
      "• без тегов — Nano Banana (gemini-2.5-flash-image).",
      "• `!g3` / `!gemini3` — Gemini-3 Pro Image Preview.",
      "• `!flash` / `!nano` — вернуться к Nano Banana.",
      "",
      "Формат кадра можно указать в брифе: `3x4`, `9x16`, `16x9`.",
      "",
      "Команды: /clear (сбросить буфер фото).",
      "Тег `!model` больше не нужен — просто присылай фото вещей + бриф.",
      "",
      "Dev-команда: `/borealis текст` — чисто текстовый запуск Borealis без картинки.",
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
    return;
  }

  // --- dev-only: /borealis {text} → текстовый Borealis без картинки ---

  if (text.startsWith("/borealis ")) {
    const brief = text.replace("/borealis", "").trim();

    try {
      const borealis = await generateBorealisDescription({
        filePath: null,
        briefText: brief,
        imageBase64: null,
      });

      const reply = formatBorealisMessage("Text-only brief (dev).", borealis);
      await sendTelegramMessage(chatId, reply);
    } catch (err) {
      console.error("Borealis text-only error:", err?.response?.data || err);
      await sendTelegramMessage(
        chatId,
        "Не удалось обработать текстовый бриф через Borealis."
      );
    }

    return;
  }

  // --- skip text-only if there is a buffered multi-image flow ---

  const bufferedPhotos = consumeBufferedPhotos(chatId);
  if (bufferedPhotos.length > 0) {
    await processBufferedOutfitInput({
      chatId,
      text,
      photos: bufferedPhotos,
    });
    return;
  }

  // --- text-only Borealis generation ---

  try {
    const borealis = await generateBorealisDescription({
      filePath: null,
      briefText: text,
      imageBase64: null,
    });

    const reply = formatBorealisMessage("Text-only brief.", borealis);
    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error("Borealis text-only error:", err?.response?.data || err);
    await sendTelegramMessage(
      chatId,
      "Не удалось обработать текстовый бриф через Borealis."
    );
  }
}

// ======================================================
// 10. HTTP endpoints
// ======================================================

app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

/**
 * Public JSON API: /api/outfit
 *
 * POST /api/outfit
 * {
 *   "image_base64": "<jpeg in base64>",
 *   "brief": "optional stylist text",
 *   "inspiration_mode": false,
 *   "format": "3x4 | 9x16 | 16x9", // optional, overrides aspect detection
 *   "engine": "nano" | "g3"       // optional, default "nano"
 * }
 *
 * Response 200:
 * {
 *   "mode": "OUTFIT_ONLY",
 *   "engine": "nano" | "g3",
 *   "borealis": { "title": "...", "description": "...", "references": [...] },
 *   "image_base64": "<jpeg in base64 or null>"
 * }
 */
app.post("/api/outfit", async (req, res) => {
  try {
    const {
      image_base64,
      brief = "",
      inspiration_mode = false,
      format = null,
      engine = "nano",
    } = req.body || {};

    if (!image_base64) {
      return res.status(400).json({ error: "image_base64 is required" });
    }

    const buffer = Buffer.from(image_base64, "base64");
    const aspectHintOverride = getAspectHintFromFormat(format);

    // нормализуем engine
    let engineNormalized = "nano";
    const engineStr = String(engine || "").toLowerCase();
    if (["g3", "gemini3", "gemini-3"].includes(engineStr)) {
      engineNormalized = "g3";
    }

    let outfitInput = createEmptyOutfitInput();
    outfitInput = addImageToOutfitInput(outfitInput, buffer);
    outfitInput = attachBrief(outfitInput, brief);

    const { nbImageBuffer, borealis } = await runOutfitPipelineFromOutfitInput(
      outfitInput,
      {
        inspirationMode: !!inspiration_mode,
        aspectHintOverride,
        engine: engineNormalized,
        chatId: "api",
        downloadTelegramPhoto: null,
        runOutfitPipeline,
      }
    );

    const outImageBase64 = nbImageBuffer
      ? nbImageBuffer.toString("base64")
      : null;

    return res.json({
      mode: "OUTFIT_ONLY",
      engine: engineNormalized,
      borealis,
      image_base64: outImageBase64,
    });
  } catch (err) {
    console.error("❌ Error in /api/outfit:", err?.response?.data || err);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * Telegram webhook.
 * IMPORTANT: ACK immediately to avoid Telegram retries (duplicate updates).
 */
app.post("/webhook", (req, res) => {
  // ✅ ACK immediately
  res.sendStatus(200);

  // Process after ACK
  setImmediate(async () => {
    try {
      const update = req.body;

      // ✅ Dedup by update_id
      if (update?.update_id != null) {
        const updateKey = `u:${update.update_id}`;
        if (isDuplicate(updateKey)) {
          console.log("🟠 Duplicate update skipped:", update.update_id);
          return;
        }
      }

      console.log("📩 Incoming update:", JSON.stringify(update, null, 2));

      const message = update.message || update.edited_message;
      if (!message) {
        console.log("⚪ No message field in update");
        return;
      }

      const chatId = message.chat?.id;

      // ✅ Dedup by (chatId, message_id)
      if (message?.message_id != null && chatId != null) {
        const msgKey = `m:${chatId}:${message.message_id}`;
        if (isDuplicate(msgKey)) {
          console.log("🟠 Duplicate message skipped:", msgKey);
          return;
        }
      }

      const textOrCaption = (message.text || message.caption || "").trim();

      if (textOrCaption.startsWith("/clear")) {
        clearBufferedPhotos(chatId);
        await sendTelegramMessage(
          chatId,
          "Buffer cleared. Send new photos + text to start a fresh look."
        );
        return;
      }

      const hasPhoto = Boolean(message.photo && message.photo.length);

      if (hasPhoto) {
        await handleOutfitOnly(message);
      } else {
        await handleTextOnly(message);
      }
    } catch (err) {
      console.error("❌ Error in webhook async handler:", err?.response?.data || err);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
