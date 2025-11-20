// index.js — минимальное живое ядро для Cloud Run + Telegram

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Читаем секреты из env
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;
const PROJECT_ID = process.env.PROJECT_ID;
const PORT = process.env.PORT || 8080;

console.log('Masquerade booting…');
console.log('PROJECT_ID:', PROJECT_ID || '⛔ not set');
console.log('TELEGRAM_BOT_TOKEN:', TELEGRAM_BOT_TOKEN ? '✅ loaded' : '⛔ missing');
console.log('OPENAI_API_KEY:', OPENAI_API_KEY ? '✅ loaded' : '⛔ missing');
console.log('VERTEX_API_KEY:', VERTEX_API_KEY ? '✅ loaded' : '⛔ missing');

const TG_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

// health-check
app.get('/', (req, res) => {
  res.send('Masquerade Engine is alive 🧥');
});

// Telegram webhook
app.post('/webhook', async (req, res) => {
  try {
    console.log('Incoming update:', JSON.stringify(req.body, null, 2));

    const msg = req.body.message;
    if (!msg || !msg.chat || !msg.chat.id) {
      return res.status(200).send('ok');
    }

    const chatId = msg.chat.id;
    const text = msg.text || '';

    const replyText = text
      ? `Masquerade online.\nYou said: "${text}"`
      : 'Masquerade online. Send me something.';

    if (TG_API) {
      await axios.post(`${TG_API}/sendMessage`, {
        chat_id: chatId,
        text: replyText,
      });
    } else {
      console.error('No TELEGRAM_BOT_TOKEN, cannot send reply');
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('Error in /webhook handler:', err);
    res.status(500).send('error');
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
