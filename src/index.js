// src/index.js
import express from "express";
import axios from "axios";
import FormData from "form-data";

import { detectInputMode } from "./logic/inputDetector.js";
import { generateOutfitFromCollage } from "./engines/nanoBanana.js";
import { describeOutfit } from "./engines/borealis.js";

const app = express();
const PORT = process.env.PORT || 8080;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.warn("[Masquerade] TELEGRAM_BOT_TOKEN is not set");
}

app.use(express.json({ limit: "10mb" }));

// health-check
app.get("/", (_req, res) => {
  res.status(200).send("Masquerade Engine is alive 🧥");
});

// Telegram webhook
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    console.log("[Webhook] update:", JSON.stringify(update, null, 2));

    const message = update.message || update.edited_message;
    if (!message) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const text =
      message.caption ||
      message.text ||
      "";

    const photos = message.photo || [];
    if (!photos.length) {
      // Текст без фото → просто ответим инструкцией
      await sendTelegramMessage(
        chatId,
        "Загрузи коллаж вещей (или фото вещей) + при желании текст с вайбом, контекстом или параметрами модели."
      );
      return res.sendStatus(200);
    }

    // Берём самое большое фото
    const largestPhoto = photos[photos.length - 1];
    const fileId = largestPhoto.file_id;

    // 1) Получаем file_url у Telegram
    const fileUrl = await getTelegramFileUrl(fileId);
    console.log("[Telegram] fileUrl:", fileUrl);

    // 2) Скачиваем картинку как буфер
    const imageBuffer = await downloadImageAsBuffer(fileUrl);

    // 3) Детектируем режим (пока OUTFIT_ONLY / MODEL_ONLY)
    const modeInfo = await detectInputMode({
      imageUrls: [fileUrl],
      text,
    });

    console.log("[ModeDetect]", modeInfo);

    if (modeInfo.mode === "MODEL_ONLY") {
      await sendTelegramMessage(
        chatId,
        "Принял модель. Теперь отправь 3–8 вещей или коллаж, который хочешь примерить. Можно добавить текст с вайбом."
      );
      return res.sendStatus(200);
    }

    // v1: FULL OUTFIT PIPELINE (как в Pipedream)
    // 4) Nano Banana → картинка аутфита
    const nano = await generateOutfitFromCollage({
      imageBuffer,
      brief: text,
    });

    // 5) Borealis → описание + референсы
    const borealis = await describeOutfit({
      imageUrl: fileUrl,
      brief: text,
    });

    const caption = buildCaption(borealis);

    // 6) Отправляем фото + текст обратно в Telegram
    const resultBuffer = Buffer.from(nano.b64, "base64");

    await sendTelegramPhoto(chatId, resultBuffer, caption);

    res.sendStatus(200);
  } catch (err) {
    console.error("[Webhook] error:", err);
    try {
      if (req.body?.message?.chat?.id) {
        await sendTelegramMessage(
          req.body.message.chat.id,
          "Что-то пошло не так внутри Masquerade. Попробуй ещё раз чуть позже."
        );
      }
    } catch (e) {
      console.error("Failed to send error message to Telegram:", e);
    }
    res.sendStatus(200);
  }
});

// ───────────────── helpers ─────────────────

async function getTelegramFileUrl(fileId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const resp = await axios.get(url);
  const filePath = resp.data?.result?.file_path;
  if (!filePath) {
    throw new Error("No file_path in Telegram getFile response");
  }
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
}

async function downloadImageAsBuffer(fileUrl) {
  const resp = await axios.get(fileUrl, {
    responseType: "arraybuffer",
  });
  return Buffer.from(resp.data);
}

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: chatId,
    text,
  });
}

async function sendTelegramPhoto(chatId, buffer, caption) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "Markdown");
  form.append("photo", buffer, {
    filename: "outfit.jpg",
    contentType: "image/jpeg",
  });

  await axios.post(url, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
  });
}

function buildCaption(borealis) {
  const { title, description, references = [] } = borealis;
  let refBlock = "";
  if (references.length) {
    refBlock =
      "\n\nАрхивные отсылки:\n" +
      references.map((r) => `• ${r}`).join("\n");
  }

  return `*${title}*\n\n${description}${refBlock}`;
}

// ───────────────── start ─────────────────

app.listen(PORT, () => {
  console.log("Masquerade booting…");
  console.log("PORT:", PORT);
  console.log("PROJECT_ID:", process.env.PROJECT_ID || "not set");
  console.log("TELEGRAM_BOT_TOKEN:", TELEGRAM_BOT_TOKEN ? "✅ loaded" : "⛔ missing");
  console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ loaded" : "⛔ missing");
  console.log("VERTEX_API_KEY:", process.env.VERTEX_API_KEY ? "✅ loaded" : "⛔ missing");
  console.log(`Masquerade listening on port ${PORT}`);
});
