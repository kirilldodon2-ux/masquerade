const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = TELEGRAM_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_TOKEN}`
  : null;

// health-check
app.get("/", (req, res) => {
  res.send("Masquerade Engine is online.");
});

app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

// Telegram webhook
app.post("/webhook", async (req, res) => {
  // сразу отвечаем Telegram
  res.status(200).send("OK");

  try {
    const update = req.body;
    console.log("TG update:", JSON.stringify(update));

    const chatId = update?.message?.chat?.id;
    if (!chatId || !TELEGRAM_API) return;

    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text:
        "Masquerade online.\n" +
        "Отправь коллаж вещей + опционально текст — позже здесь появится Nano Banana + Borealis."
    });
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
