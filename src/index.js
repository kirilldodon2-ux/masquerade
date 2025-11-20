// src/index.js
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing");
} else {
  console.log("TELEGRAM_BOT_TOKEN: ✅ loaded");
}

console.log("Masquerade booting…");

// ---------- helpers ----------

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
    console.error("Failed to call Telegram API:", err?.response?.data || err);
  }
}

/**
 * Очень простой детектор режима.
 * Потом сюда добавим real CV / Nano Banana сигналы.
 */
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

  if (!hasPhoto) {
    return "TEXT_ONLY";
  }

  // модель без вещей (по тексту)
  if (hasPhoto && containsModelOnlyHint) {
    return "MODEL_WAITING_ITEMS";
  }

  // Try-on: пользователь прямо намекает, что это модель
  if (hasPhoto && containsHumanHint) {
    return "TRY_ON";
  }

  // по умолчанию — просто коллаж / вещи
  if (hasPhoto) {
    return "OUTFIT_ONLY";
  }

  return "UNKNOWN";
}

// ---------- stub-пайплайны (потом заменим на реальный AI) ----------

async function handleOutfitOnly(message) {
  const chatId = message.chat.id;
  const caption = message.caption || message.text || "";

  const reply = [
    "*Mode:* Outfit / Collage.",
    "",
    "Я вижу изображения одежды.",
    "В следующих итерациях я буду:",
    "1) вытаскивать из коллажа отдельные вещи,",
    "2) собирать цельный образ,",
    "3) генерировать редакторское описание.",
    "",
    "_Пока это заглушка — скелет движка уже на месте ✅_",
    caption ? `\nТвой бриф: \`${caption}\`` : "",
  ].join("\n");

  await sendTelegramMessage(chatId, reply);
}

async function handleTryOn(message) {
  const chatId = message.chat.id;
  const caption = message.caption || message.text || "";

  const reply = [
    "*Mode:* Try-on (model + items).",
    "",
    "Вижу модель + вещи.",
    "План пайплайна:",
    "1) вырезать / зафиксировать модель,",
    "2) наложить выбранный аутфит,",
    "3) вернуть try-on визуал + описание образа.",
    "",
    "_Сейчас это описательная заглушка — визуал и Borealis текст подключим в следующих шагах._",
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
      "🧥 *Borealis Masquerade в сети.*",
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
      "3) Получи собранный аутфит и текст.",
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
    return;
  }

  const reply = [
    "Я жду изображения с вещами или моделью.",
    "",
    "• Отправь коллаж с одеждой.",
    "• Или фото модели + вещи, которые нужно примерить.",
    "",
    "Команды: /start, /help",
  ].join("\n");

  await sendTelegramMessage(chatId, reply);
}

// ---------- HTTP endpoints ----------

// health check / браузер
app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

// основной Telegram webhook
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
    res.sendStatus(200); // чтобы Telegram не спамил ретраями
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
