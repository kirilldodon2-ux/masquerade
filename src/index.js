// src/index.js
import express from "express";

const app = express();
app.use(express.json());

// ─── ENV ────────────────────────────────────────────

const PORT = process.env.PORT || 8080;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;
const PROJECT_ID = process.env.PROJECT_ID;

// Проверяем подключение секретов (безопасно)
console.log("🔥 BOOT: Masquerade Engine starting…");
console.log("🔐 Secret check:", {
  TELEGRAM_BOT_TOKEN: !!TELEGRAM_BOT_TOKEN,
  OPENAI_API_KEY: !!OPENAI_API_KEY,
  VERTEX_API_KEY: !!VERTEX_API_KEY,
  PROJECT_ID: PROJECT_ID || null,
});

// ─── HEALTHCHECK ─────────────────────────────────────

app.get("/", (req, res) => {
  res.status(200).send("Masquerade Engine OK");
});

// ─── TELEGRAM WEBHOOK ────────────────────────────────

app.post("/webhook", async (req, res) => {
  console.log("📨 Incoming update:", JSON.stringify(req.body, null, 2));

  // Telegram требует instant-ответ
  res.status(200).json({ ok: true });

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("⚠ TELEGRAM_BOT_TOKEN missing — cannot send reply");
    return;
  }

  try {
    const message = req.body.message || req.body.edited_message;
    if (!message || !message.chat || !message.chat.id) {
      console.warn("⚠ No chat.id — skip");
      return;
    }

    const chatId = message.chat.id;

    const replyText =
      "Masquerade Engine online ⚡\n" +
      "Webhook connected. Secrets loaded ✓\n" +
      "Send me an outfit collage anytime.";

    const tgResp = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
        }),
      }
    );

    const data = await tgResp.json();
    console.log("📤 Telegram answer:", data);
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
  }
});

// ─── START SERVER ─────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
