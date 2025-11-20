// src/index.js
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

// ---------- helpers: Telegram ----------

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
 * Скачиваем оригинал фото из Telegram:
 *  - находим самое большое в message.photo
 *  - получаем file_path через getFile
 *  - скачиваем байты
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

// ---------- helpers: Nano Banana (Gemini 2.5 Flash Image) ----------

async function generateNanoBananaImage(buffer, briefText = "", options = {}) {
  if (!VERTEX_API_KEY) {
    console.warn("VERTEX_API_KEY is missing, skipping Nano Banana");
    return null;
  }

  const { inspirationMode = false } = options;

  const base64 = buffer.toString("base64");
  const brief = (briefText || "").trim();

  const baseInstruction = inspirationMode
    ? `You are a fashion concept engine.
Use this image as visual inspiration (colors, shapes, textures, composition, mood)
to design a new full-body outfit on a standing model.
Do NOT literally redraw objects from the image; translate them into clothing, accessories and silhouette.`
    : `You are a fashion virtual try-on engine.
Take this collage of clothing items and dress a standing full-body model
in these exact clothes and accessories, without changing design, materials or colors.`;

  const textPrompt = brief
    ? `${baseInstruction}\nStylist brief: ${brief}`
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

  console.log("🟡 Nano Banana image generated");
  return Buffer.from(inline.data, "base64");
}

// ---------- helpers: Borealis description (OpenAI Responses) ----------

async function generateBorealisDescription({ filePath, briefText = "" }) {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY missing, skipping Borealis description");
    return {
      title: "Готовый образ",
      description: "",
      references: [],
    };
  }

  const imageUrl = filePath
    ? `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`
    : null;

  const systemPrompt = `
You are BOREALIS EDITORIAL ENGINE 1.1 — a high-precision fashion narrator combining
OpenAI clarity, Margiela restraint, Kojima introspection and archival fashion culture.

Your task: создать атмосферное, кинематографичное описание образа + ровно ПЯТЬ архивных отсылок
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

RULES FOR REFERENCES (ВСЕГДА РОВНО 5 ШТУК):
Массив "references" ДОЛЖЕН содержать ровно 5 строк.

1–3 строки — МОДА:
  — реальные дизайнеры, дома, эпохи, направления
  — максимум 3–5 слов
  — без вымышленных имён и коллекций
  — если ты не уверен, используй обобщения вроде
    «японский стрит 2000-х», «европейский авангард 90-х».

2–4 строки — ШИРЕ КУЛЬТУРЫ:
  — фильмы, аниме, сериалы, музыка, книги, субкультуры
  — максимум 3–7 слов
  — подбирай то, что честно резонирует с образом
  — если аутфит явно отсылает к известному тайтлу (например, Paradise Kiss),
    можно использовать его как одну из ссылок.

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

  // Нормализуем references: убираем пустые, обрезаем до 5
  references = references
    .filter((r) => typeof r === "string" && r.trim())
    .map((r) => r.trim());
  if (references.length > 5) {
    references = references.slice(0, 5);
  }

  console.log("🟣 Borealis description generated");

  return { title, description, references };
}

// ---------- formatting helper for Telegram ----------

function formatBorealisMessage(
  modeLabel,
  borealis,
  originalBrief = "",
  options = {}
) {
  const { inspirationNote } = options;

  const title = (borealis.title || "Готовый образ").trim();
  const description = (borealis.description || "").trim();
  const refs = Array.isArray(borealis.references)
    ? borealis.references
    : [];

  const lines = [];

  lines.push(`> Mode: ${modeLabel}`);

  if (inspirationNote) {
    lines.push(inspirationNote);
  }

  lines.push("");
  lines.push(`*${title}*`);
  lines.push("");
  lines.push(description);

  if (refs.length > 0) {
    lines.push("");
    lines.push("_References:_");
    for (const r of refs) {
      lines.push(`• ${r}`);
    }
  }

  if (originalBrief) {
    lines.push("");
    lines.push("_Brief:_");
    lines.push(originalBrief);
  }

  return lines.filter(Boolean).join("\n");
}

// ---------- simple mode detector ----------

function detectMode(message) {
  const hasPhoto = Boolean(message.photo && message.photo.length);
  const text = (message.caption || message.text || "").toLowerCase();

  const modelOnlyHints = [
    "просто модель",
    "только модель",
    "just model",
    "face only",
  ];

  const containsModelOnlyHint = modelOnlyHints.some((h) =>
    text.includes(h)
  );

  if (!hasPhoto) {
    return "TEXT_ONLY";
  }

  // Явно говорит, что это только модель → ждём вещи
  if (containsModelOnlyHint) {
    return "MODEL_WAITING_ITEMS";
  }

  // До реального try-on всё с фото считаем коллажом / аутфитом
  return "OUTFIT_ONLY";
}

// ---------- handlers ----------

async function handleOutfitOnly(message) {
  const chatId = message.chat.id;
  const rawCaption = message.caption || message.text || "";
  const lower = rawCaption.toLowerCase();

  // Явный флаг inspiration-режима
  const inspirationMode =
    lower.includes("!inspire") ||
    lower.includes("#inspire") ||
    lower.includes("!vibe");

  // Чистим подсказку от служебного тега
  const caption = rawCaption.replace(/!inspire|#inspire|!vibe/gi, "").trim();

  // 1) фото из Telegram
  const { filePath, buffer } = await downloadTelegramPhoto(message);

  // 2) Nano Banana — с флагом inspirationMode
  const nbImageBuffer = await generateNanoBananaImage(buffer, caption, {
    inspirationMode,
  }).catch((err) => {
    console.error("Nano Banana error:", err);
    return null;
  });

  // 3) Borealis описание
  const borealis = await generateBorealisDescription({
    filePath,
    briefText: caption,
  }).catch((err) => {
    console.error("Borealis error:", err);
    return {
      title: "Готовый образ",
      description: "",
      references: [],
    };
  });

  const captionText = formatBorealisMessage(
    "Outfit / Collage.",
    borealis,
    caption,
    {
      inspirationNote: inspirationMode
        ? "_Source: visual inspiration, not clothing collage._"
        : "",
    }
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
    "Теперь кинь 3–8 вещей или коллаж, которые хочешь примерить на неё.",
    "Можно также просто описать настроение образа (vibe) — я соберу референс.",
  ].join("\n");

  await sendTelegramMessage(chatId, reply);
}

async function handleTextOnly(message) {
  const chatId = message.chat.id;
  const text = message.text || "";

  // --- команды ---

  if (text.startsWith("/start")) {
    const reply = [
      "🧥 *Borealis Masquerade онлайн.*",
      "",
      "Пришли коллаж на белом фоне или несколько фото вещей + короткий бриф (vibe / история).",
      "Я соберу цельный образ и дам редакторское описание.",
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
    return;
  }

  if (text.startsWith("/help")) {
    const reply = [
      "Masquerade — fashion-intelligence engine.",
      "",
      "1) Пришли коллаж / фото вещей.",
      "2) Добавь пару строк про настроение и контекст.",
      "3) Получи собранный аутфит, визуал и Borealis-описание.",
      "",
      "Плюс: можешь просто описать образ словами — я соберу его из текста.",
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
    return;
  }

  // --- новый режим: text-only brief → Borealis outfit ---

  try {
    const borealis = await generateBorealisDescription({
      filePath: null, // нет картинки, только текст
      briefText: text,
    });

    const reply = formatBorealisMessage(
      "Text-only brief.",
      borealis,
      text
    );

    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error("Borealis text-only error:", err?.response?.data || err);

    const fallback = [
      "Не удалось обработать бриф через Borealis.",
      "",
      "Но ты можешь:",
      "• прислать коллаж / фото вещей,",
      "• или попробовать сократить / переформулировать текст.",
    ].join("\n");

    await sendTelegramMessage(chatId, fallback);
  }
}

// ---------- HTTP endpoints ----------

app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

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
