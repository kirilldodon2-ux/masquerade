// src/core/outfit-parser.js
// Outfit Parser v2 scaffold: naive text-based tags, placeholder colors.

/**
 * @param {import("./outfit-input.js").OutfitInput} outfitInput
 * @returns {{ items: any[], styleTags: string[], colors: string[] }}
 */
export function analyzeOutfit(outfitInput) {
  const normalized = outfitInput || {};
  const brief = (normalized.brief || "").toLowerCase();
  const items = Array.isArray(normalized.items) ? normalized.items : [];

  const styleTags = new Set();

  if (brief.includes("street") || brief.includes("hoodie") || brief.includes("sneakers")) {
    styleTags.add("street");
  }

  if (brief.includes("suit") || brief.includes("blazer")) {
    styleTags.add("lux");
  }

  if (brief.includes("minimal") || brief.includes("clean")) {
    styleTags.add("minimal");
  }

  // TODO: add actual color extraction from vision pipeline / palette detection.
  const colors = [];

  return {
    items,
    styleTags: Array.from(styleTags),
    colors,
  };
}
