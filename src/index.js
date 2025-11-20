// src/index.js
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing");
} else {
  console.log("TELEGRAM_BOT_TOKEN: ✅ loaded");
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────

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
    console.error("❌ Failed to call sendMessage:", err.response?.data || err);
  }
}

// Определяем режим работы по входящему сообщению
function detectMode(message) {
  const hasPhoto =
    Array.isArray(message.photo) && message.photo.length > 0 ||
    (message.document && message.document.mime_type?.startsWith("image/"));

  const text = message.text || message.caption || "";
  const normalized = text.toLowerCase();

  // очень грубые эвристики для первого шага
  const mentionsModel =
    normalized.includes("model") ||
    normalized.includes("модель") ||
    normalized.includes("#tryon") ||
    normalized.includes("на мне");

  if (hasPhoto && mentionsModel) {
    return "TRY_ON"; // model + items (по тексту понимаем, что есть модель)
  }

  if (hasPhoto && !mentionsModel) {
    return "OUTFIT_ONLY"; // считаем, что это просто вещи / коллаж
  }

  if (!hasPhoto && normalized.length > 0) {
    return "TEXT_ONLY"; // описание без картинок, пригодится позже
  }

  return "UNKNOWN";
}

// ───────────────────────────────────────────────
// HTTP endpoints
// ───────────────────────────────────────────────

// Health-check / браузер
app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

// Главный Telegram webhook
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    console.log("📩 Incoming update:", JSON.stringify(update, null, 2));

    const message = update.message || update.edited_message;
    if (!message) {
      console.log("⚪ No message in update");
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const text = message.text || message.caption || "";

    // ── Команды
    if (text.startsWith("/start")) {
      await sendTelegramMessage(
        chatId,
        [
          "*Masquerade Engine is alive.*",
          "",
          "Send me a collage of items (or multiple clothing photos) and an optional brief.",
          "I’ll build an outfit and editorial description.",
        ].join("\n")
      );
      return res.sendStatus(200);
    }

    if (text.startsWith("/help")) {
      await sendTelegramMessage(
        chatId,
        [
          "*Masquerade — Fashion Intelligence Engine*",
          "",
          "• Mode 1: *Outfit / Collage* — send 1 collage or 2–12 clothing photos.",
          "• Mode 2: *Try-on* — send photo of a model + items, add text with word `model` or `try-on`.",
          "• Mode 3: *Model only* — send a portrait or full-body photo, I’ll ask for items.",
        ].join("\n")
      );
      return res.sendStatus(200);
    }

    // ── Авто-режим
    const mode = detectMode(message);
    console.log("🧠 Detected mode:", mode);

    switch (mode) {
      case "OUTFIT_ONLY":
        await handleOutfitOnly(chatId, message);
        break;

      case "TRY_ON":
        await handleTryOn(chatId, message);
        break;

      case "MODEL_WAITING_ITEMS":
        // пока не используем, но оставляю для будущего Vision-анализатора
        await handleModelOnly(chatId, message);
        break;

      case "TEXT_ONLY":
        await sendTelegramMessage(
          chatId,
          "Got your brief. Now send a collage or clothing photos — I’ll build an outfit around this vibe."
        );
        break;

      default:
        await sendTelegramMessage(
          chatId,
          "Got your message.\n\nSend me a collage with items, or a model + items, and I’ll start building the look."
        );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in /webhook:", err.response?.data || err);
    // Telegram всегда должен получать 200, даже если внутри ошибка
    res.sendStatus(200);
  }
});

// ───────────────────────────────────────────────
// Mode handlers (пока без Vertex/OpenAI, только структура)
// ───────────────────────────────────────────────

async function handleOutfitOnly(chatId, message) {
  const caption = message.caption || message.text || "";

  // TODO: тут будет:
  // 1) скачать фотки вещей
  // 2) отправить их в Nano Banana
  // 3) получить итоговый outfit-visual
  // 4) прогнать через Borealis для текстового описания

  console.log("🧵 [OUTFIT_ONLY] caption:", caption);

  await sendTelegramMessage(
    chatId,
    [
      "Mode: *Outfit / Collage*.",
      "",
      "I see clothing images. In the next iteration I’ll:",
      "1) parse items from the collage,",
      "2) build a consistent outfit,",
      "3) generate an editorial-grade description.",
      "",
      "For now this is a stub response — engine skeleton is in place ✅",
    ].join("\n")
  );
}

async function handleTryOn(chatId, message) {
  const caption = message.caption || message.text || "";

  // TODO:
  // 1) отделить фото модели от фото вещей (Vision или простые правила)
  // 2) передать model_image + items в Nano Banana (try-on)
  // 3) описать результат через Borealis

  console.log("🧵 [TRY_ON] caption:", caption);

  await sendTelegramMessage(
    chatId,
    [
      "Mode: *Try-on (Model + Items)*.",
      "",
      "I’ll soon be able to place your items on the provided model.",
      "Engine skeleton is ready — next step is wiring Nano Banana + Borealis.",
    ].join("\n")
  );
}

async function handleModelOnly(chatId, message) {
  console.log("🧵 [MODEL_ONLY]");

  await sendTelegramMessage(
    chatId,
    [
      "Got your model photo ✅",
      "",
      "Now send 3–8 items or a collage you want to try on.",
      "Optionally describe the vibe (city, party, runway, character etc.).",
    ].join("\n")
  );
}

// ───────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
