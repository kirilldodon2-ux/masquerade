// src/engines/nano-banana/adapter.js
// Adapter: OutfitInput -> Nano Banana (Gemini) payload

import { createEmptyOutfitInput } from "../../core/outfit-input.js";

/**
 * Normalize OutfitInput into buffer/filePath/brief payload for Nano Banana.
 * Supports Telegram photo objects (file_id) via provided downloader.
 *
 * @param {import("../../core/outfit-input.js").OutfitInput} outfitInput
 * @param {{ downloadTelegramPhoto?: Function }} options
 * @returns {Promise<{ buffer: Buffer|null, filePath: string|null, brief: string, flags: object, preset: string|null, additionalImagesCount: number }>}
 */
export async function outfitInputToNanoBananaRequest(
  outfitInput,
  { downloadTelegramPhoto } = {}
) {
  const normalized = outfitInput || createEmptyOutfitInput();
  const items = Array.isArray(normalized.items) ? normalized.items : [];
  const primary = items[0] || null;
  const additionalImagesCount = items.length > 1 ? items.length - 1 : 0;

  let buffer = null;
  let filePath = null;

  // 1) Already a buffer
  if (Buffer.isBuffer(primary)) {
    buffer = primary;
  }

  // 2) Object with embedded buffer
  if (!buffer && primary && Buffer.isBuffer(primary.buffer)) {
    buffer = primary.buffer;
    filePath = primary.filePath || null;
  }

  // 3) Telegram photo descriptor { file_id, ... }
  if (!buffer && primary && primary.file_id && downloadTelegramPhoto) {
    const resp = await downloadTelegramPhoto({ photo: [primary] });
    buffer = resp?.buffer || null;
    filePath = resp?.filePath || null;
  }

  // 4) Base64 string
  if (!buffer && typeof primary === "string" && primary.trim()) {
    try {
      buffer = Buffer.from(primary, "base64");
    } catch (err) {
      console.warn("[outfitInputToNanoBananaRequest] Failed to parse base64");
    }
  }

  return {
    buffer,
    filePath,
    brief: normalized.brief || "",
    flags: normalized.flags || {},
    preset: normalized.preset || null,
    additionalImagesCount,
  };
}
