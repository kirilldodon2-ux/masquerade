// src/index.js
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;

// 1) Берём токен и TRIM-им (обрежет пробелы/перевод строки)
const RAW_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_BOT_TOKEN = RAW_TOKEN.trim();

console.log("Masquerade booting…");

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing or empty");
} else {
  const safePreview =
    TELEGRAM_BOT_TOKEN.slice(0, 5) + "..." + TELEGRAM_BOT_TOKEN.slice(-5);
  console.log(
    "TELEGRAM_BOT_TOKEN: ✅ loaded",
    "(len:",
    TELEGRAM_BOT_TOKEN.length,
    ", preview:",
    safePreview,
    ")"
  );
}

// health-check
app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

// главный webhook
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    console.log("📩 Incoming update:", JSON.stringify(update, null, 2));

    const message = update.message || update.edited_message;
    if (!message) {
      console.log("⚪ No message field in update");
      return res.sendStatus(200);
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
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      console.log("📡 Telegram URL:", url.replace(TELEGRAM_BOT_TOKEN, "<TOKEN>"));

      const payload = {
        chat_id: chatId,
        text: replyText,
      };
      console.log("📦 Telegram payload:", JSON.stringify(payload));

      const tgResp = await axios.post(url, payload);
      console.log("✅ Telegram response:", JSON.stringify(tgResp.data));
    } else {
      console.log("⚠️ No chatId or TELEGRAM_BOT_TOKEN missing");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(
      "❌ Error in /webhook:",
      err?.response?.data || err.message || err
    );
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
