// src/index.js

const express = require("express");

const app = express();
app.use(express.json());

// ── Env ──────────────────────────────────────────────────────────────
const {
  TELEGRAM_BOT_TOKEN,
  OPENAI_API_KEY,
  VERTEX_API_KEY,
  PROJECT_ID,
  PORT = 8080,
  NODE_ENV,
} = process.env;

const TELEGRAM_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

// Логи при старте (без утечки секретов)
console.log("Masquerade booting…");
console.log("PROJECT_ID:", PROJECT_ID || "❌ not set");
console.log("NODE_ENV:", NODE_ENV || "not set");
console.log("TELEGRAM_BOT_TOKEN:", TELEGRAM_API ? "✅ loaded" : "❌ missing");
console.log("OPENAI_API_KEY:", OPENAI_API_KEY ? "✅ loaded" : "❌ missing");
console.log("VERTEX_API_KEY:", VERTEX_API_KEY ? "✅ loaded" : "❌ missing");

// ── Healthcheck / root ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).send("Masquerade Engine is alive 🧥");
});

// ── Telegram webhook ────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("Incoming update:", JSON.stringify(req.body, null, 2));

  try {
    const update = req.body;

    if (!update.message) {
      console.log("No message field in update → ok");
      return res.status(200).send("ok");
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text || "";

    // ── Простое роутирование команд ────────────────────────────────
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "🧥 *Borealis Masquerade — Fashion Intelligence Engine*\n\n" +
          "Отправь мне фото или коллаж вещей — дальше я буду генерировать образы и истории.\n\n" +
          "_(beta mode: пока отвечаю тестовыми сообщениями)_",
        { parse_mode: "Markdown" }
      );
    } else if (text === "/ping") {
      await sendTelegramMessage(chatId, "pong 🧥");
    } else {
      // Пока что просто echo + логика для будущего пайплайна
      await sendTelegramMessage(
        chatId,
        `Я получил: \`${text}\`\n\nСкоро здесь будет Nano Banana + Borealis Narrator 🍌`,
        { parse_mode: "Markdown" }
      );
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Error handling Telegram webhook:", err);
    // Телеге всегда важно вернуть 200, иначе она будет ретраить
    return res.status(200).send("ok");
  }
});

// ── Helpers ─────────────────────────────────────────────────────────
async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!TELEGRAM_API) {
    console.error("TELEGRAM_API is not configured, cannot send message");
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

    let data = null;
    try {
      data = await resp.json();
    } catch {
      // если ответ не JSON
    }

    if (!resp.ok || (data && !data.ok)) {
      console.error("Telegram sendMessage error:", {
        status: resp.status,
        statusText: resp.statusText,
        data,
      });
    } else {
      console.log("Message sent to chat", chatId);
    }
  } catch (err) {
    console.error("Failed to call Telegram API:", err);
  }
}

// ── Start server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
