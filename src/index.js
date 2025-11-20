import express from "express";

const app = express();
app.use(express.json());

// Порт для Cloud Run
const PORT = process.env.PORT || 8080;

// Токен бота берём из переменной окружения
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

// health-check
app.get("/", (req, res) => {
  res.send("Masquerade Engine is alive. 🌫");
});

// основной вебхук от Telegram
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;

    const chatId = update?.message?.chat?.id;
    const text = update?.message?.text || "";

    // Пока просто тестовый ответ — потом сюда воткнём Nano Banana + Borealis
    if (chatId && TELEGRAM_API_BASE) {
      const replyText =
        "Masquerade Engine online.\n" +
        "Отправь коллаж или фото аутфита — дальше будет магия. (test build)";

      // Используем встроенный fetch в Node 18+/22
      await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
        }),
      });
    }

    // Важно: всегда отвечаем 200, иначе Telegram будет ретраить
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade Engine listening on port ${PORT}`);
});
