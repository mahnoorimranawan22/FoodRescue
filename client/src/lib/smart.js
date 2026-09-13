/**
 * FoodRescue — Smart Assist (idea 17).
 *
 * A zero-dependency heuristic "AI": the provider types what they have, we
 * infer category, urgency, suggested quantity unit, shelf-life hours and
 * dietary tags from keywords — then auto-pick a matching photo. Deterministic,
 * instant, and offline-friendly (demo mode needs no server).
 */

import { CATEGORY_IMAGES } from "./images";

const rules = [
  {
    category: "Bakery",
    keywords: ["bread", "sourdough", "bagel", "croissant", "cake", "pastry", "donut", "brioche", "loaf", "roll", "baguette", "muffin", "brownie"],
    shelfHours: 36,
  },
  {
    category: "Dairy",
    keywords: ["yogurt", "yoghurt", "milk", "cheese", "butter", "cream", "dairy", "paneer", "lassi"],
    shelfHours: 48,
  },
  {
    category: "Produce",
    keywords: ["vegetable", "salad", "greens", "fruit", "apple", "banana", "tomato", "carrot", "produce", "crate", "veg", "potato", "onion"],
    shelfHours: 72,
  },
  {
    category: "Packaged Goods",
    keywords: ["canned", "jar", "pasta", "rice", "cereal", "staple", "packet", "tinned", "flour", "sugar", "sauce", "dry"],
    shelfHours: 720,
  },
  {
    category: "Prepared Food",
    keywords: ["meal", "tray", "lasagna", "curry", "soup", "rice box", "sandwich", "wrap", "pizza", "biryani", "pasta bake", "hot", "catering", "buffet", "salad bar", "kitchen"],
    shelfHours: 6,
  },
];

// Keyword → dietary tag inference
const TAG_KEYWORDS = [
  { tag: "vegetarian", words: ["veg", "salad", "fruit", "cheese", "yogurt", "yoghurt", "lasagna", "pasta", "bread", "cake", "rice", "soup", "paneer"] },
  { tag: "vegan", words: ["vegan", "plant", "fruit", "vegetable", "salad", "produce"] },
  { tag: "halal", words: ["halal", "chicken", "beef", "lamb", "biryani", "kebab"] },
  { tag: "gluten-free", words: ["gluten", "celiac", "rice", "salad"] },
  { tag: "keep refrigerated", words: ["dairy", "yogurt", "yoghurt", "milk", "cheese", "meat", "cream", "tray", "meal", "lasagna"] },
];

/** "Fresh sourdough loaves" → { category, shelfHours, matched } | null */
export function inferCategory(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return null;
  let best = null;
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (t.includes(kw)) {
        // longer keyword = more specific match wins
        if (!best || kw.length > best.matched.length) {
          best = { category: rule.category, shelfHours: rule.shelfHours, matched: kw };
        }
      }
    }
  }
  return best;
}

/** Infer dietary/safety tags from free text. */
export function inferTags(text) {
  const t = String(text || "").toLowerCase();
  const tags = [];
  for (const { tag, words } of TAG_KEYWORDS) {
    if (words.some((w) => t.includes(w))) tags.push(tag);
  }
  return tags;
}

/**
 * Full Smart Assist: returns partial form values to merge into the
 * List Surplus form — category, urgency, unit, expiry, tags, imageUrl.
 * `urgencyHint` ("urgent" | "auto") biases the urgency suggestion.
 */
export function smartAssist({ title, quantity, urgencyHint }) {
  const inference = inferCategory(title);
  if (!inference) return null;
  const { category, shelfHours } = inference;
  const tags = inferTags(title);

  // Urgency from shelf life + hint: prepared food defaults to expiring soon
  let urgency = "normal";
  if (urgencyHint === "urgent" || shelfHours <= 6) urgency = "urgent";
  else if (shelfHours <= 48) urgency = "expiring_soon";

  const unitByCategory = {
    Bakery: "loaves",
    Dairy: "items",
    Produce: "crates",
    "Packaged Goods": "items",
    "Prepared Food": "portions",
  };

  return {
    category,
    urgencyLevel: urgency,
    unit: unitByCategory[category] || "portions",
    tags,
    imageUrl: CATEGORY_IMAGES[category] || "",
    suggestedExpiryHours: shelfHours,
    matched: inference.matched,
  };
}
