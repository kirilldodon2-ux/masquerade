// src/index.js
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing");
} else {
  console.log("TELEGRAM_BOT_TOKEN: ✅ loaded");
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing — AI описание работать не будет");
} else {
  console.log("OPENAI_API_KEY: ✅ loaded");
}

console.log("Masquerade booting…");

// ---------- helpers: Telegram ----------

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
 * Качаем файл из Telegram и возвращаем { base64, mime }.
 */
async function downloadTelegramImage(fileId) {
  // 1) узнаём путь файла
  const fileResp = await axios.get(`${TELEGRAM_API}/getFile`, {
    params: { file_id: fileId },
  });

  if (!fileResp.data.ok) {
    throw new Error(`getFile failed: ${JSON.stringify(fileResp.data)}`);
  }

  const filePath = fileResp.data.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

  // Очень грубо определяем mime по расширению
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : "image/jpeg";

  // 2) качаем байты
  const imgResp = await axios.get(fileUrl, { responseType: "arraybuffer" });
  const base64 = Buffer.from(imgResp.data, "binary").toString("base64");

  return { base64, mime };
}

// ---------- helpers: OpenAI Borealis Engine ----------

async function generateOutfitDescriptionFromImage({ base64Image, mime, caption }) {
  if (!OPENAI_API_KEY) {
    return "⚠️ OPENAI_API_KEY не настроен, поэтому я пока не могу сделать Borealis-описание.";
  }

  const systemPrompt = `
You are *Borealis Editorial Engine* inside the Masquerade fashion system.
You analyze outfit collages and write concise, atmospheric fashion editorials.

Rules:
- Think like a stylist + fashion editor.
- Be specific about silhouette, fabric, details, references (designers, subcultures, eras).
- Tone: intelligent, cinematic, but not pretentious.
- Output in Markdown, with clear sections.

Structure:
1. Title line — a short poetic name for the outfit.
2. One paragraph — high-level vibe and context (where / who / why).
3. Bullet list:
   - Key pieces (top, bottom, outerwear, shoes, accessories).
   - Silhouette & proportions.
   - Texture & color story.
4. One closing line — how this look feels in motion / in a scene.
`.trim();

  const userText = [
    "Analyze this outfit collage and write an editorial description.",
    "Focus on the clothes, not the person.",
    caption ? `User brief / vibe: "${caption}".` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        // при желании поменяешь на свою модель
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const content =
      resp.data.choices?.[0]?.message?.content?.trim() ||
      "No response from model.";

    return content;
  } catch (err) {
    console.error("OpenAI error:", err?.response?.data || err);
    return "⚠️ Не получилось вызвать Borealis Engine — проверь OpenAI логи / ключ.";
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

  if (hasPhoto && containsModelOnlyHint) {
    return "MODEL_WAITING_ITEMS";
  }

  if (hasPhoto && containsHumanHint) {
    return "TRY_ON";
  }

  if (hasPhoto) {
    return "OUTFIT_ONLY";
  }

  return "UNKNOWN";
}

// ---------- pipeline: Outfit Only = реальный AI ----------

async function handleOutfitOnly(message) {
  const chatId = message.chat.id;
  const caption = message.caption || message.text || "";

  try {
    // Берём самое большое фото
    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    const fileId = bestPhoto.file_id;

    console.log("🖼  Handling OUTFIT_ONLY, file_id:", fileId);

    const { base64, mime } = await downloadTelegramImage(fileId);
    const editorial = await generateOutfitDescriptionFromImage({
      base64Image: base64,
      mime,
      caption,
    });

    const reply = [
      "*Mode:* Outfit / Collage.",
      "",
      "Я разобрал коллаж и собрал Borealis-описание образа:",
      "",
      editorial,
    ].join("\n");

    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error("Error in handleOutfitOnly:", err);
    const fallback = [
      "*Mode:* Outfit / Collage.",
      "",
      "Я получил изображение, но не смог обработать его до конца.",
      "Проверь, что коллаж в адекватном разрешении и попробуй ещё раз.",
    ].join("\n");
    await sendTelegramMessage(chatId, fallback);
  }
}

// ---------- TRY_ON & другие режимы пока оставляем как были ----------

async function handleTryOn(message) {
  const chatId = message.chat.id;
  const caption = message.caption || message.text || "";

  const reply = [
    "*Mode:* Try-on (model + items).",
    "",
    "Вижу модель + вещи.",
    "Следующий шаг — подключить визуальный try-on (Nano Banana).",
    "Пока что я только фиксирую, что это режим примерки.",
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

app.get("/", (req, res) => {
  res.send("Masquerade Engine is running.");
});

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
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Masquerade listening on port ${PORT}`);
});
