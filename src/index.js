import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

// ── Env & config ──────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;
const PROJECT_ID = process.env.PROJECT_ID || "PROJECT_ID";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing");
}
if (!OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY is missing (Borealis offline)");
}
if (!VERTEX_API_KEY) {
  console.warn("⚠️ VERTEX_API_KEY is missing (Nano Banana offline)");
}

const TELEGRAM_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

// ── Middleware ────────────────────────────────────────────────

app.use(
  express.json({
    limit: "20mb",
  })
);

// ── Healthcheck ──────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send("Masquerade Engine is alive 🧥");
});

// ── Telegram webhook ─────────────────────────────────────────

app.post("/webhook", async (req, res) => {
  const update = req.body;
  console.log("Incoming update:", JSON.stringify(update, null, 2));

  try {
    const msg = update.message || update.edited_message;
    if (!msg) {
      // Ничего умного не пришло — просто подтверждаем 200
      return res.sendStatus(200);
    }

    const chatId = msg.chat.id;
    const text = msg.text || msg.caption || "";
    const hasPhoto = Boolean(msg.photo && msg.photo.length > 0);

    // ── Команды ────────────────────────────────────────

    if (text.startsWith("/start")) {
      await sendTelegramMessage(
        chatId,
        "Masquerade Engine online.\n\n" +
          "Отправь:\n" +
          "1️⃣ Коллаж / вещи — соберу образ.\n" +
          "2️⃣ Модель + вещи — примерю образ на модель.\n" +
          "3️⃣ Только модель — предложу, что к ней собрать.\n\n" +
          "Команда /help — краткая шпаргалка."
      );
      return res.sendStatus(200);
    }

    if (text.startsWith("/help")) {
      await sendTelegramMessage(
        chatId,
        "Masquerade Input Modes:\n\n" +
          "🧩 OUTIFT ONLY — просто вещи или коллаж.\n" +
          "🧍 TRY-ON — модель + вещи.\n" +
          "👤 MODEL ONLY — только модель, бот ждёт вещи.\n\n" +
          "Сейчас идёт настройка движка, ответы могут быть базовыми."
      );
      return res.sendStatus(200);
    }

    // ── Базовый ответ (fallback) ──────────────────────

    if (hasPhoto) {
      await sendTelegramMessage(
        chatId,
        "Принял изображения. Движок Masquerade онлайн 🧥\n" +
          "Сейчас я ещё настраиваюсь, скоро начну собирать полноценные образы."
      );
    } else if (text) {
      await sendTelegramMessage(
        chatId,
        `Я получил: «${text}».\n\nMasquerade уже запущен, я скоро начну собирать образы по фото и коллажам.`
      );
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error handling Telegram webhook:", err);
    // В любом случае отвечаем 200, чтобы Telegram не ретраил вечно
    return res.sendStatus(200);
  }
});

// ── Helpers ──────────────────────────────────────────────────

async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!TELEGRAM_API) {
    console.error("❌ TELEGRAM_API is not configured");
    return;
  }

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...extra,
  };

  try {
    const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!data.ok) {
      console.error("Telegram sendMessage error:", data);
    } else {
      console.log("Message sent to chat", chatId);
    }
  } catch (err) {
    console.error("Failed to call Telegram API:", err);
  }
}

// ── Start server (for local dev / Cloud Run) ─────────────────

app.listen(PORT, () => {
  console.log("Masquerade listening on port", PORT);
  console.log("PROJECT_ID:", PROJECT_ID);
  console.log("TELEGRAM_BOT_TOKEN:", TELEGRAM_BOT_TOKEN ? "✅ loaded" : "❌ missing");
  console.log("OPENAI_API_KEY:", OPENAI_API_KEY ? "✅ loaded" : "❌ missing");
  console.log("VERTEX_API_KEY:", VERTEX_API_KEY ? "✅ loaded" : "❌ missing");
});
