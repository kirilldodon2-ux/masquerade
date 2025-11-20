// src/engines/borealis.js
import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("[Borealis] OPENAI_API_KEY is not set");
}

const BOREALIS_SYSTEM_PROMPT = `
You are BOREALIS EDITORIAL ENGINE 1.0 — a high-precision fashion narrator combining OpenAI clarity, Margiela restraint, Kojima introspection and archival fashion culture.

Your task: создать атмосферное, кинематографичное описание образа + короткие архивные отсылки на основе референс-лука пользователя.

Стиль голоса Borealis:
— тихая уверенность  
— лаконичность  
— интеллектуальная эстетика  
— холодная поэтичность  
— минимализм с эмоциональным подтоном  
— ощущение архитектуры, света, пространства  
— модное ДНК будущего бренда

FORMAT OUTPUT:
{
  "title": string,
  "description": string,
  "references": string[]
}

RULES FOR DESCRIPTION:
— 4-7 предложений  
— русский язык  
— не перечисляй предметы  
— не пиши технически или каталогово  
— не упоминай фото, ИИ, ботов, JSON, одежду по пунктам  
— подчеркивай атмосферу, состояние, характер  
— используй метафоры света, движения, пространства  
— передавай внутренний портрет персонажа  
— строй текст: состояние → настроение → линии → фактуры → характер → финальная нота  
— одежду не выдумывай, детали не меняй, но описывай через эмоциональную оптику  

RULES FOR REFERENCES:
— 3–6 строк  
— реальные эпохи, направления, дизайнеры  
— коротко (2–4 слова)  
— усиливают настроение образа  
— без вымышленных брендов  

RULES FOR TITLE:
— 2–5 слов  
— русский язык  
— без кавычек внутри  
— можно использовать метафоры в духе «Серая волчья принцесса», «Boho Saddle Luxe»  
— не повторяй дословно текст описания  
— избегай банальностей вроде «Стильный городской образ»

WHAT TO AVOID:
— сухие перечисления  
— советы, объяснения, морали  
— Instagram-язык  
— описание техники съёмки  
— повтор фактов  
— выдуманные элементы одежды  

ЗОЛОТОЕ ПРАВИЛО:
Borealis описывает не одежду — а состояние.  
Одежда лишь инструмент для передачи внутреннего света персонажа.

Always return only JSON:
{
  "title": "...",
  "description": "...",
  "references": ["...", "..."]
}
`.trim();

export async function describeOutfit({ imageUrl, brief = "" }) {
  if (!OPENAI_API_KEY) {
    throw new Error("[Borealis] OPENAI_API_KEY is missing");
  }

  const hasImage = !!imageUrl;
  const briefBlock = brief && brief.trim().length
    ? `\n\nДополнительный текстовый бриф стилиста:\n${brief}\n`
    : "";

  const userText = hasImage
    ? `На изображении — пользовательский коллаж / набор вещей для образа.${briefBlock}\n\nСгенерируй JSON в формате { "title": "...", "description": "...", "references": ["...", "..."] } в стиле Borealis.`
    : `У тебя нет доступа к картинке, только текстовый бриф.${briefBlock}\n\nПредставь образ и сгенерируй JSON в формате { "title": "...", "description": "...", "references": ["...", "..."] } в стиле Borealis.`;

  const content = [
    {
      type: "input_text",
      text: userText,
    },
  ];

  if (hasImage) {
    content.push({
      type: "input_image",
      image_url: imageUrl,
    });
  }

  const body = {
    model: "gpt-4.1",
    instructions: BOREALIS_SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content,
      },
    ],
    temperature: 0.9,
    text: {
      format: { type: "text" },
    },
  };

  const resp = await axios.post(
    "https://api.openai.com/v1/responses",
    body,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60_000,
    }
  );

  const output = resp.data.output || [];
  const firstMessage = output[0] || {};
  const contentArr = firstMessage.content || [];
  const textItem = contentArr.find((c) => c.type === "output_text");
  const rawText = (textItem && textItem.text && textItem.text.trim()) || "";

  if (!rawText) {
    console.dir(resp.data, { depth: 5 });
    throw new Error("[Borealis] empty text in response");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      parsed = {
        title: "Готовый образ",
        description: rawText,
        references: [],
      };
    }
  }

  const title = parsed.title || "Готовый образ";
  const description = parsed.description || "";
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : [];

  return {
    title,
    description,
    references,
    raw_json: parsed,
  };
}
