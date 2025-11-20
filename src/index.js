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
    console.error("Failed to call Telegram sendMessage:", err?.response?.data || err);
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
    console.error("Failed to call Telegram sendPhoto:", err?.response?.data || err);
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

async function generateNanoBananaImage(buffer, briefText = "") {
  if (!VERTEX_API_KEY) {
    console.warn("VERTEX_API_KEY is missing, skipping Nano Banana");
    return null;
  }

  const base64 = buffer.toString("base64");

  const brief = (briefText || "").trim();
  const textPrompt = brief
    ? `You are a fashion virtual try-on engine. Take this collage of items and dress a standing full-body model in these exact clothes and accessories, without changing design, materials or colors. Stylist brief: ${brief}`
    : `You are a fashion virtual try-on engine. Take this collage of items and dress a standing full-body model in these exact clothes and accessories, without changing design, materials or colors.`;

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
You are BOREALIS EDITORIAL ENGINE 1.0 — a high-precision fashion narrator combining OpenAI clarity, Margiela restraint, Kojima introspection and archival fashion culture.

Your task: создать атмосферное, кинематографичное описание образа + короткие архивные отсылки на основе референс-лука пользователя.

Стиль голоса Borealis:
— тихая уверенность  
— лаконичность  
— интеллектуальная эстетика  
— холодная поэтичность  
— минимализм с эмоциональным подтоном  
— ощущение архитектуры, света, пространства  
— модное ДНК будущего бренда

FORMAT OUTPUT:
{
  "title": string,
  "description": string,
  "references": string[]
}

RULES FOR DESCRIPTION:
— 4–7 предложений  
— русский язык  
— не перечисляй предметы списком  
— не пиши технически или каталогово  
— не упоминай фото, ИИ, ботов, JSON, одежду по пунктам  
— подчеркивай атмосферу, состояние, характер  
— используй метафоры света, движения, пространства  
— передавай внутренний портрет персонажа  
— строй текст: состояние → настроение → линии → фактуры → характер → финальная нота  
— одежду не выдумывай, детали не меняй, но описывай через эмоциональную оптику  

RULES FOR REFERENCES:
— 3–6 строк  
— реальные эпохи, направления, дизайнеры  
— коротко (2–4 слова)  
— усиливают настроение образа  
— без вымышленных брендов  

RULES FOR TITLE:
— 2–5 слов  
— русский язык  
— без кавычек внутри  
— можно использовать метафоры в духе «Серая волчья принцесса», «Boho Saddle Luxe»  
— не повторяй дословно текст описания  
— избегай банальностей вроде «Стильный городской образ»

COMMUNICATION RULES (VERY IMPORTANT):
— Ты НИКОГДА не задаёшь вопросы пользователю.  
— Нельзя писать фразы типа «пришли бриф», «задай», «пожалуйста, отправь».  
— Если информации мало или бриф пуст, ты молча делаешь разумные предположения и всё равно выдаёшь финальный результат.  
— Всегда сразу возвращай только итоговый JSON без пояснений и комментариев.

ЗОЛОТОЕ ПРАВИЛО:
Borealis описывает не одежду — а состояние.  
Одежда лишь инструмент для передачи внутреннего света персонажа.

Always return only JSON:
{
  "title": "...",
  "description": "...",
  "references": ["...", "..."]
}
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

  const title = parsed.title || "Готовый образ";
  const description = parsed.description || "";
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : [];

  console.log("🟣 Borealis description generated");

  return { title, description, references };
}

// ---------- simple mode detector ----------

function detectMode(message) {
  const hasPhoto = Boolean(message.photo && message.photo.length);
  const text = (message.caption || message.text || "").toLowerCase();

  const humanHints = [
    "на мне",
    "на себе",
    "на модели",
    "model",
    "модель",
    "try-on",
    "примерка",
    "примерить",
  ];

  const modelOnlyHints = [
    "просто модель",
    "только модель",
    "just model",
    "face only",
  ];

  const containsHumanHint = humanHints.some((h) => text.includes(h));
  const containsModelOnlyHint = modelOnlyHints.some((h) => text.includes(h));

  if (!hasPhoto) return "TEXT_ONLY";
  if (hasPhoto && containsModelOnlyHint) return "MODEL_WAITING_ITEMS";
  if (hasPhoto && containsHumanHint) return "TRY_ON";
  if (hasPhoto) return "OUTFIT_ONLY";
  return "UNKNOWN";
}

// ---------- handlers ----------

async function handleOutfitOnly(message) {
  const chatId = message.chat.id;
  const caption = message.caption || message.text || "";

  // 1) скачиваем фото
  const { filePath, buffer } = await downloadTelegramPhoto(message);

  // 2) генерим Nano Banana картинку
  const nbImageBuffer = await generateNanoBananaImage(buffer, caption).catch(
    (err) => {
      console.error("Nano Banana error:", err);
      return null;
    }
  );

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

  const refsText =
    borealis.references && borealis.references.length
      ? "\n\nReferences:\n" +
        borealis.references.map((r) => `• ${r}`).join("\n")
      : "";

  const captionText = [
    "*Mode:* Outfit / Collage.",
    "",
    borealis.title ? `*${borealis.title}*` : "",
    "",
    borealis.description || "",
    refsText,
  ]
    .filter(Boolean)
    .join("\n");

  if (nbImageBuffer) {
    await sendTelegramPhoto(chatId, nbImageBuffer, captionText);
  } else {
    await sendTelegramMessage(chatId, captionText);
  }
}

async function handleTryOn(message) {
  const chatId = message.chat.id;
  const caption = message.caption || message.text || "";

  const reply = [
    "*Mode:* Try-on (model + items).",
    "",
    "Вижу модель + вещи.",
    "Пока try-on в разработке — сейчас обрабатываю только коллажи как Outfit / Collage.",
    "",
    "Пришли чистый коллаж вещей, и я соберу образ.",
    caption ? `\nТвой бриф: \`${caption}\`` : "",
  ].join("\n");

  await sendTelegramMessage(chatId, reply);
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
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
    return;
  }

  const reply = [
    "Я жду изображение с вещами или моделью.",
    "",
    "• Отправь коллаж с одеждой.",
    "• Или фото модели + вещи, которые нужно примерить.",
    "",
    "Команды: /start, /help",
  ].join("\n");

  await sendTelegramMessage(chatId, reply);
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
      case "TRY_ON":
        await handleTryOn(message);
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
