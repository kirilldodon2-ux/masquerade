// src/index.js
// Masquerade / Borealis Engine v1.6

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import FormData from "form-data";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

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

async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
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
    form.append("parse_mode", "Markdown");
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
// 2. Aspect ratio helpers (3×4 / 9×16 / 16×9)
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
// 3. Nano Banana (Gemini 2.5 Flash Image) engine
// ======================================================

async function generateNanoBananaImage(buffer, briefText = "", options = {}) {
  if (!VERTEX_API_KEY) {
    console.warn("VERTEX_API_KEY is missing, skipping Nano Banana");
    return null;
  }

  // options: { inspirationMode?: boolean, aspectHintOverride?: string | null }
  const { inspirationMode = false, aspectHintOverride = null } = options;

  const base64 = buffer.toString("base64");
  const brief = (briefText || "").trim();

  // финальный хинт: либо явный override, либо из брифа
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

  const url =
    "https://aiplatform.googleapis.com/v1/" +
    "publishers/google/models/gemini-2.5-flash-image:generateContent" +
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
    console.error("Nano Banana response without inline_data:", resp.data);
    throw new Error("No Base64 image in Nano Banana response");
  }

  console.log("🟡 Nano Banana (Gemini 2.5 Flash Image) generated");
  return Buffer.from(inline.data, "base64");
}

// ======================================================
// 4. Borealis description (OpenAI Responses)
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
— 4–7 предложений, русский язык
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
— допускаются метафоры («Туманный рейдер мегаполиса», «Сахарный рок-сад»)
— не повторяй дословно текст описания
— избегай банальностей вроде «Стильный городской образ»

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
// 5. Formatting for Telegram
// ======================================================

function formatBorealisMessage(modeLabel, borealis) {
  const title = (borealis.title || "Готовый образ").trim();
  const description = (borealis.description || "").trim();
  const refs = Array.isArray(borealis.references)
    ? borealis.references
    : [];

  const fashion = refs.slice(0, 3).filter(Boolean);
  const music = refs.slice(3, 5).filter(Boolean);
  const culture = refs.slice(5, 6).filter(Boolean);

  const lines = [];

  // header
  lines.push(`> Mode: ${modeLabel}`);
  lines.push("");
  lines.push(`*${title}*`);
  lines.push("");
  if (description) {
    lines.push(description);
  }

  if (refs.length > 0) {
    lines.push("");
    lines.push("_References:_");

    if (fashion.length) {
      lines.push("*Fashion:*");
      fashion.forEach((r) => lines.push(`• ${r}`));
    }

    if (music.length) {
      lines.push("");
      lines.push("*Music:*");
      music.forEach((r) => lines.push(`• ${r}`));
    }

    if (culture.length) {
      lines.push("");
      lines.push("*Culture:*");
      culture.forEach((r) => lines.push(`• ${r}`));
    }
  }

  return lines.filter(Boolean).join("\n");
}

// ======================================================
// 6. Mode detection
// ======================================================

function detectMode(message) {
  const hasPhoto = Boolean(message.photo && message.photo.length);
  const text = (message.caption || message.text || "").toLowerCase();

  const modelOnlyHints = [
    "просто модель",
    "только модель",
    "just model",
    "face only",
    "!model",
    "#model",
    "model only",
    "mode: model",
  ];

  const containsModelOnlyHint = modelOnlyHints.some((h) =>
    text.includes(h)
  );

  if (!hasPhoto) {
    return "TEXT_ONLY";
  }

  if (containsModelOnlyHint) {
    return "MODEL_WAITING_ITEMS";
  }

  // По умолчанию — считаем, что это коллаж / аутфит
  return "OUTFIT_ONLY";
}

// ======================================================
// 7. Core pipeline: buffer -> NanoBanana + Borealis
// ======================================================

async function runOutfitPipeline({
  buffer,
  filePath = null,
  brief = "",
  inspirationMode = false,
  aspectHintOverride = null,
}) {
  // 1) Nano Banana — визуал
  const nbImageBuffer = await generateNanoBananaImage(buffer, brief, {
    inspirationMode,
    aspectHintOverride,
  }).catch((err) => {
    console.error("Nano Banana error:", err?.response?.data || err);
    return null;
  });

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
// 8. Telegram handlers
// ======================================================

async function handleOutfitOnly(message) {
  const chatId = message.chat.id;
  const rawCaption = message.caption || message.text || "";
  const lower = rawCaption.toLowerCase();

  // explicit inspiration flag
  const inspirationMode =
    lower.includes("!inspire") ||
    lower.includes("#inspire") ||
    lower.includes("!vibe");

  // clean brief from flags
  const brief = rawCaption.replace(/!inspire|#inspire|!vibe/gi, "").trim();

  // 1) get photo
  const { filePath, buffer } = await downloadTelegramPhoto(message);

  // 2) run engine
  const { nbImageBuffer, borealis } = await runOutfitPipeline({
    buffer,
    filePath,
    brief,
    inspirationMode,
    aspectHintOverride: null, // Telegram → формат из брифа / дефолт
  });

  const captionText = formatBorealisMessage(
    inspirationMode ? "Inspiration moodboard." : "Outfit / Collage.",
    borealis
  );

  if (nbImageBuffer) {
    await sendTelegramPhoto(chatId, nbImageBuffer, captionText);
  } else {
    await sendTelegramMessage(chatId, captionText);
  }
}

async function handleModelWaitingItems(message) {
  const chatId = message.chat.id;

  const reply = [
    "*Mode:* Model only.",
    "",
    "Я принял модель.",
    "Сейчас режим `model` работает как подготовка: я запоминаю, что это именно модель.",
    "Пока гардероб всё равно читается из следующего коллажа / фото вещей.",
    "",
    "Следующий шаг в roadmap — научить Masquerade гибридному режиму:",
    "отдельно модель + отдельно коллаж вещей → один собранный лук.",
  ].join("\n");

  await sendTelegramMessage(chatId, reply);
}

/**
 * TEXT_ONLY: честный режим — бот ждёт картинку.
 * + dev-команда /borealis для текстового теста редактора.
 */
async function handleTextOnly(message) {
  const chatId = message.chat.id;
  const text = message.text || "";

  // --- commands ---

  if (text.startsWith("/start")) {
    const reply = [
      "🧥 *Borealis Masquerade онлайн.*",
      "",
      "Я работаю с изображениями и собираю цельные образы.",
      "",
      "*Базовый флоу*:",
      "• пришли коллаж на белом фоне или несколько фото вещей + короткий бриф (vibe / история),",
      "• получишь готовый аутфит (модель + лук) и Borealis-описание.",
      "",
      "*Режимы:*",
      "• без тегов — считаю, что это коллаж вещей.",
      "• `!inspire` / `!vibe` — картинка как moodboard, я придумываю look по мотивам.",
      "• `!model` — это просто модель, вещи пришли отдельно (режим «жду гардероб»).",
      "",
      "Формат кадра можно подсказать в тексте брифа: `3x4`, `9x16` или `16x9`.",
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
    return;
  }

  if (text.startsWith("/help")) {
    const reply = [
      "Masquerade — fashion-intelligence engine.",
      "",
      "*Как со мной работать:*",
      "1) Пришли коллаж / фото вещей на нейтральном фоне.",
      "2) Добавь пару строк про настроение и контекст.",
      "3) Получи собранный аутфит, визуал и Borealis-описание.",
      "",
      "*Теги режимов:*",
      "• `!inspire` или `!vibe` — картинка как moodboard, я собираю look по мотивам.",
      "• `!model` — фото модели отдельно, гардероб придёт следующими картинками (roadmap-фича).",
      "",
      "Формат кадра можно указать в брифе: `3x4`, `9x16`, `16x9`.",
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

  // --- default: no image → honestly ask for image ---

  const reply = [
    "Я жду изображение, чтобы собрать образ. 🌫",
    "",
    "Отправь:",
    "• коллаж с вещами + бриф,",
    "• или вдохновляющую картинку + `!inspire` / `!vibe`.",
    "",
    "Команды: /start, /help",
  ].join("\n");

  await sendTelegramMessage(chatId, reply);
}

// ======================================================
// 9. HTTP endpoints
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
 *   "format": "3x4 | 9x16 | 16x9" // optional, overrides aspect detection
 * }
 *
 * Response 200:
 * {
 *   "mode": "OUTFIT_ONLY",
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
    } = req.body || {};

    if (!image_base64) {
      return res.status(400).json({ error: "image_base64 is required" });
    }

    const buffer = Buffer.from(image_base64, "base64");
    const aspectHintOverride = getAspectHintFromFormat(format);

    const { nbImageBuffer, borealis } = await runOutfitPipeline({
      buffer,
      filePath: null, // generic API, no Telegram URL
      brief,
      inspirationMode: !!inspiration_mode,
      aspectHintOverride,
    });

    const outImageBase64 = nbImageBuffer
      ? nbImageBuffer.toString("base64")
      : null;

    return res.json({
      mode: "OUTFIT_ONLY",
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
 */
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    console.log("📩 Incoming update:", JSON.stringify(update, null, 2));

    const message = update.message || update.edited_message;
    if (!message) {
      console.log("⚪ No message field in update");
      return res.sendStatus(200);
    }

    const mode = detectMode(message);
    console.log("🔎 Detected mode:", mode);

    switch (mode) {
      case "OUTFIT_ONLY":
        await handleOutfitOnly(message);
        break;
      case "MODEL_WAITING_ITEMS":
        await handleModelWaitingItems(message);
        break;
      case "TEXT_ONLY":
      default:
        await handleTextOnly(message);
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in /webhook:", err?.response?.data || err);
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
