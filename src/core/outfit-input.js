// src/core/outfit-input.js
// Reusable OutfitInput model and helpers

/**
 * @typedef {Object} OutfitInput
 * @property {Array<any>} items - Primary outfit item references (images or IDs).
 * @property {Array<any>} [bodyRefs] - Optional body/person references for try-on context.
 * @property {Array<any>} [bgRefs] - Optional background/location references.
 * @property {{ nano?: boolean, g3?: boolean }} flags - Engine selection flags.
 * @property {string|null} [preset] - Active preset name.
 * @property {string|null} [brief] - User-provided text brief.
 */

/**
 * Create an empty OutfitInput with safe defaults.
 * @returns {OutfitInput}
 */
export function createEmptyOutfitInput() {
  return {
    items: [],
    bodyRefs: [],
    bgRefs: [],
    flags: {},
    preset: null,
    brief: null,
  };
}

/**
 * Add an image reference to the OutfitInput items.
 * @param {OutfitInput} outfitInput
 * @param {any} imageRef
 * @returns {OutfitInput}
 */
export function addImageToOutfitInput(outfitInput, imageRef) {
  if (!imageRef) return outfitInput;
  const next = outfitInput || createEmptyOutfitInput();
  const items = Array.isArray(next.items) ? next.items : [];

  return {
    ...next,
    items: [...items, imageRef],
  };
}

/**
 * Attach a text brief to the OutfitInput.
 * @param {OutfitInput} outfitInput
 * @param {string} brief
 * @returns {OutfitInput}
 */
export function attachBrief(outfitInput, brief) {
  const next = outfitInput || createEmptyOutfitInput();

  return {
    ...next,
    brief: brief || null,
  };
}
