// src/engines/nanoBanana.js
import axios from "axios";

const VERTEX_API_KEY = process.env.VERTEX_API_KEY;

if (!VERTEX_API_KEY) {
  console.warn("[NanoBanana] VERTEX_API_KEY is not set");
}

export async function generateOutfitFromCollage({ imageBuffer, brief = "" }) {
  if (!imageBuffer) {
    throw new Error("[NanoBanana] imageBuffer is empty");
  }
  if (!VERTEX_API_KEY) {
    throw new Error("[NanoBanana] VERTEX_API_KEY is missing");
  }

  const b64 = imageBuffer.toString("base64");

  const textPrompt =
    brief && brief.trim().length
      ? `You are a fashion virtual try-on engine. Take this collage of items and dress a standing full-body model in these EXACT clothes and accessories, without changing design, materials or colors. Stylist brief: ${brief}`
      : `You are a fashion virtual try-on engine. Take this collage of items and dress a standing full-body model in these EXACT clothes and accessories, without changing design, materials or colors.`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: textPrompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: b64,
            },
          },
        ],
      },
    ],
  };

  const url =
    "https://aiplatform.googleapis.com/v1/" +
    "publishers/google/models/gemini-2.5-flash-image:generateContent" +
    `?key=${VERTEX_API_KEY}`;

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 60_000,
  });

  function findInlineData(node) {
    if (!node || typeof node !== "object") return null;
    if (node.inline_data?.data) return node.inline_data;
    if (node.inlineData?.data) return node.inlineData;
    for (const value of Object.values(node)) {
      const found = findInlineData(value);
      if (found) return found;
    }
    return null;
  }

  const inline = findInlineData(resp.data);
  if (!inline || !inline.data) {
    console.dir(resp.data, { depth: 7 });
    throw new Error("[NanoBanana] No inline_data image found in response");
  }

  return {
    b64: inline.data,
  };
}
