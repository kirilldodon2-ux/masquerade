// src/index.js
import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ВАЖНО: сразу трим токен, чтобы убрать \n, пробелы и т.п.
const RAW_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_BOT_TOKEN = RAW_TOKEN.trim();

const PORT = process.env.PORT || 8080;

console.log("Masquerade booting…");
if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing or empty");
} else {
  console.log(
    "TELEGRAM_BOT_TOKEN: ✅ loaded, length =",
    TELEGRAM_BOT_TOKEN.length
  );
}

// health-check
app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

// главный webhook
app.post("/webhook", async (req, res) => {
  console.log("==== /webhook HIT ====");
  console.log("Raw body:", JSON.stringify(req.body, null, 2));

  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;

    if (!message) {
      console.log("⚪ No message field in update");
      return res.status(200).send("no message");
    }

    const chatId = message.chat.id;
    const text = message.text || message.caption || "";

    console.log("💬 From chat:", chatId, "text:", text);

    let replyText;

    if (text.startsWith("/start")) {
      replyText =
        "Masquerade Engine is alive.\n\n" +
        "Send me a collage of items (or multiple clothing photos) and an optional brief.\n" +
        "I’ll build an outfit and editorial description.";
    } else if (text.startsWith("/help")) {
      replyText =
        "Masquerade — fashion intelligence engine.\n\n" +
        "1) Send a collage with items.\n" +
        "2) Optionally add a text brief (vibe, context, body type).\n" +
        "3) Get an AI-built outfit + Borealis description.";
    } else {
      replyText =
        "Got your message.\n\n" +
        "Soon I’ll turn this into a full outfit pipeline. For now, send /start or a collage.";
    }

    if (chatId && TELEGRAM_BOT_TOKEN) {
      const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const payload = { chat_id: chatId, text: replyText };

      console.log("📤 Sending reply to Telegram…");
      console.log("   chat_id:", chatId);
      console.log("   URL (masked):", `https://api.telegram.org/bot<token>/sendMessage`);

      try {
        const tgRes = await axios.post(tgUrl, payload);
        console.log("✅ Telegram response:", tgRes.data);
      } catch (err) {
        console.error(
          "❌ Error calling Telegram sendMessage:",
          err.response?.data || err.message
        );
      }
    } else {
      console.error("❌ No chatId or TELEGRAM_BOT_TOKEN missing in handler");
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Error in /webhook handler:", err);
    return res.status(200).send("ok");
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
