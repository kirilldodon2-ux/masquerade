// src/index.js
import express from "express";
import axios from "axios";

const app = express();

// Парсим JSON от Telegram
app.use(express.json());

const PORT = process.env.PORT || 8080;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

console.log("Masquerade booting…");
console.log(
  "TELEGRAM_BOT_TOKEN:",
  TELEGRAM_BOT_TOKEN ? "✅ loaded" : "❌ MISSING"
);

// Health-check / браузер
app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

// Главный webhook
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
    } else if (text.startsWith("/about")) {
      replyText =
        "Outfit Builder by Borealis Masquerade — Fashion Intelligence Engine.\n" +
        "Industry-grade try-on & editorial descriptions for fashion, film and creative teams.";
    } else {
      replyText =
        "Got your message.\n\n" +
        "Right now I’m in minimal mode: I respond to /start and /help.\n" +
        "Very soon this will be a full outfit pipeline again.";
    }

    if (!TELEGRAM_BOT_TOKEN) {
      console.error("❌ No TELEGRAM_BOT_TOKEN inside /webhook, cannot reply");
      return res.sendStatus(200);
    }

    if (!chatId) {
      console.error("❌ No chat_id in message");
      return res.sendStatus(200);
    }

    const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const payload = {
      chat_id: chatId,
      text: replyText,
    };

    console.log("📤 Sending reply:", JSON.stringify(payload, null, 2));

    const tgRes = await axios.post(tgUrl, payload);
    console.log("✅ Telegram response:", tgRes.data);

    res.sendStatus(200);
  } catch (err) {
    console.error(
      "❌ Error in /webhook:",
      err?.response?.data || err.message || err
    );
    // Всё равно 200, чтобы Telegram не зацикливал ретраи
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
