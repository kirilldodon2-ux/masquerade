// src/core/outfit-pipeline.js
// Helpers to build and run OutfitInput pipelines

import {
  createEmptyOutfitInput,
  addImageToOutfitInput,
  attachBrief,
} from "./outfit-input.js";
import { outfitInputToNanoBananaRequest } from "../engines/nano-banana/adapter.js";
import { analyzeOutfit } from "./outfit-parser.js";

function parseFlagsFromText(rawCaption = "") {
  const lower = rawCaption.toLowerCase();

  const inspirationMode =
    lower.includes("!inspire") ||
    lower.includes("#inspire") ||
    lower.includes("!vibe");

  const wantGemini3 =
    lower.includes("!g3") ||
    lower.includes("!gemini3") ||
    lower.includes("#g3") ||
    lower.includes("gemini 3");

  const forceFlash = lower.includes("!flash") || lower.includes("!nano");

  let engine = "nano";
  if (wantGemini3 && !forceFlash) {
    engine = "g3";
  }

  const brief = rawCaption
    .replace(/!inspire|#inspire|!vibe/gi, "")
    .replace(/!g3|!gemini3|#g3|gemini 3/gi, "")
    .replace(/!flash|!nano/gi, "")
    .trim();

  return { inspirationMode, engine, brief };
}

function buildOutfitInputFromPhotos(photos = [], brief = null, flags = {}) {
  let outfitInput = createEmptyOutfitInput();

  photos.forEach((photo) => {
    outfitInput = addImageToOutfitInput(outfitInput, photo);
  });

  if (brief) {
    outfitInput = attachBrief(outfitInput, brief);
  }

  return {
    ...outfitInput,
    flags: flags || {},
  };
}

export function buildOutfitInputFromTelegram({
  chatId = null,
  images = [],
  text = "",
  flags = null,
}) {
  const { inspirationMode, engine, brief } = parseFlagsFromText(text || "");
  const flagObj =
    flags ||
    (engine === "g3"
      ? { g3: true }
      : { nano: true });

  const outfitInput = buildOutfitInputFromPhotos(images, brief, flagObj);

  return {
    chatId,
    outfitInput,
    inspirationMode,
    engine,
    brief,
  };
}

export async function runOutfitPipelineFromOutfitInput(
  outfitInput,
  {
    inspirationMode = false,
    aspectHintOverride = null,
    engine = "nano",
    chatId = null,
    downloadTelegramPhoto,
    runOutfitPipeline,
  } = {}
) {
  if (!runOutfitPipeline) {
    throw new Error("runOutfitPipeline is required");
  }

  const {
    buffer,
    filePath,
    brief,
    additionalImagesCount,
  } = await outfitInputToNanoBananaRequest(outfitInput, {
    downloadTelegramPhoto,
  });

  const parsed = analyzeOutfit(outfitInput);

  const imageContextHint =
    additionalImagesCount > 0
      ? `Also consider ${additionalImagesCount} additional outfit reference photos from this session.`
      : "";

  const imageCount = Array.isArray(outfitInput?.items)
    ? outfitInput.items.length
    : 0;
  const briefPreview = (brief || "").slice(0, 80);
  console.log("🧾 OutfitInput → pipeline", {
    chatId: chatId || "unknown",
    images: imageCount,
    brief: briefPreview,
    styleTags: parsed.styleTags,
  });

  return runOutfitPipeline({
    buffer,
    filePath,
    brief,
    inspirationMode,
    aspectHintOverride,
    engine,
    imageContextHint,
    parsedOutfit: parsed,
  });
}
