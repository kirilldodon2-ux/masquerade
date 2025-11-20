// src/logic/inputDetector.js
// v1: очень простой детектор режима. Работает так:
// - если есть картинка и НЕТ явного "это я / модель" в тексте → считаем коллажем (OUTFIT_ONLY)
// - если есть картинка и в тексте есть "я", "на мне", "model", "моя фигура" → MODEL_ONLY (ожидаем вещи)
// В будущем сюда добавим прямой vision-вызов и полноценный TRY_ON.

export async function detectInputMode({ imageUrls = [], text = "" }) {
  const hasImage = imageUrls.length > 0;
  const brief = (text || "").toLowerCase();

  if (!hasImage) {
    return {
      mode: "TEXT_ONLY",
      reason: "no_image",
    };
  }

  // Очень грубая эвристика "это я / модель"
  const modelHints = [
    "это я",
    "на мне",
    "мой портрет",
    "my body",
    "my figure",
    "myself",
    "на этой модели",
    "model photo",
    "photo of me",
  ];

  const isModelContext = modelHints.some((h) => brief.includes(h));

  if (isModelContext) {
    return {
      mode: "MODEL_ONLY",
      reason: "single_image_with_model_context",
      modelImage: imageUrls[0],
      itemImages: [],
    };
  }

  // По умолчанию считаем это коллажем / набором вещей
  return {
    mode: "OUTFIT_ONLY",
    reason: "single_image_treated_as_collage",
    collageImage: imageUrls[0],
  };
}
