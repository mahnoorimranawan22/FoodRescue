/**
 * Groq AI food classification.
 *
 * `classifyFood(description)` sends the item's title/description to Groq's
 * `openai/gpt-oss-120b` and gets back:
 *   { category, shelfLifeHours, urgency, summary }
 *
 * (Model note: the original spec asked for `llama-3.3-70b-versatile`, which
 * Groq has since retired — the live /models list is queried at startup below
 * so the best available chat model is picked automatically.)
 *
 * Resilience: if no GROQ_API_KEY is configured (or the API errors/times out),
 * a deterministic keyword heuristic produces the same JSON shape so the
 * endpoint always answers — the client experience never breaks, it just
 * silently loses LLM nuance.
 */
const { GROQ_API_KEY } = require("../config");

let MODEL = "openai/gpt-oss-120b"; // default; replaced by the live probe below
const TIMEOUT_MS = 10_000;

const VALID = {
  categories: [
    "Prepared Food",
    "Bakery",
    "Produce",
    "Dairy",
    "Packaged Goods",
  ],
  urgencies: ["normal", "expiring_soon", "urgent"],
};

let client = null;
try {
  if (GROQ_API_KEY) {
    const Groq = require("groq-sdk");
    client = new Groq({ apiKey: GROQ_API_KEY, timeout: TIMEOUT_MS });
  }
} catch {
  client = null; // SDK not installed — heuristic fallback handles everything
}

const SYSTEM_PROMPT = `You are the food-safety assistant for FoodRescue, a surplus food
redistribution platform. Given a free-text description of surplus food, respond with ONLY
a JSON object (no markdown, no prose) with exactly these fields:
  "category": one of ["Prepared Food", "Bakery", "Produce", "Dairy", "Packaged Goods"]
  "shelfLifeHours": integer estimate of safe shelf life from now (perishables 2-72,
                    packaged goods up to 720)
  "urgency": one of ["normal", "expiring_soon", "urgent"]
             (urgent if shelfLifeHours < 4, expiring_soon if < 48, else normal)
  "summary": one short sentence (max 15 words) describing the item for a listing card.
Food-safety first: cooked/leftover prepared food gets short shelf life; sealed
shelf-stable packaging gets long. Never invent categories outside the list.`;

/**
 * Pick the best available chat model on this account at startup. Groq retires
 * models over time (llama-3.3-70b-versatile was), so hardcoding a name is how
 * the feature silently dies. Falls back to the default above on any error.
 */
(async () => {
  if (!client) return;
  try {
    const models = await client.models.list();
    const ids = (models.data || []).map((m) => m.id);
    const preferred = [
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
      "groq/compound",
    ];
    MODEL = preferred.find((id) => ids.includes(id)) || MODEL;
    console.log(`[ai] using Groq model: ${MODEL}`);
  } catch {
    /* keep default — classify still works via heuristic on failure */
  }
})();

/** Keyword heuristic — mirrors client/src/lib/smart.js so both agree. */
function heuristicClassify(description) {
  const text = String(description || "").toLowerCase();
  const rules = [
    {
      category: "Bakery",
      words: ["bread", "sourdough", "bagel", "croissant", "cake", "pastry", "donut", "brioche", "loaf", "roll", "baguette", "muffin", "brownie"],
      shelfLifeHours: 36,
    },
    {
      category: "Dairy",
      words: ["yogurt", "yoghurt", "milk", "cheese", "butter", "cream", "dairy", "paneer", "lassi"],
      shelfLifeHours: 48,
    },
    {
      category: "Produce",
      words: ["vegetable", "salad", "greens", "fruit", "apple", "banana", "tomato", "carrot", "produce", "crate", "veg", "potato", "onion"],
      shelfLifeHours: 72,
    },
    {
      category: "Packaged Goods",
      words: ["canned", "jar", "pasta", "rice", "cereal", "staple", "packet", "tinned", "flour", "sugar", "sauce", "dry"],
      shelfLifeHours: 720,
    },
    {
      category: "Prepared Food",
      words: ["meal", "tray", "lasagna", "curry", "soup", "sandwich", "wrap", "pizza", "biryani", "hot", "catering", "buffet", "kitchen", "leftover"],
      shelfLifeHours: 6,
    },
  ];

  const hit = rules.find((r) => r.words.some((w) => text.includes(w)));
  const shelfLifeHours = hit ? hit.shelfLifeHours : 24;
  const category = hit ? hit.category : "Prepared Food";
  const urgency =
    shelfLifeHours < 4 ? "urgent" : shelfLifeHours < 48 ? "expiring_soon" : "normal";
  return {
    category,
    shelfLifeHours,
    urgency,
    summary: String(description || "").slice(0, 80),
    source: "heuristic",
  };
}

function clampPositiveInt(value, max) {
  // Models sometimes answer "about 6 hours" or "6-8" — extract the first integer.
  const m = String(value ?? "").match(/\d+/);
  const n = m ? Math.round(Number(m[0])) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, max);
}

/**
 * Classify surplus food text via Groq (llama-3.3-70b-versatile).
 * Always resolves with { category, shelfLifeHours, urgency, summary, source }.
 */
async function classifyFood(description) {
  const text = String(description || "").trim();
  if (!text) {
    return { ...heuristicClassify(""), source: "heuristic" };
  }

  if (!client) return heuristicClassify(text);

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 500) },
      ],
      temperature: 0.2,
      max_tokens: 600, // reasoning models spend tokens thinking before the JSON
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);

    const category = VALID.categories.includes(parsed.category)
      ? parsed.category
      : null;
    const shelfLifeHours = clampPositiveInt(parsed.shelfLifeHours, 720 * 30);
    const urgency = VALID.urgencies.includes(parsed.urgency)
      ? parsed.urgency
      : null;

    if (!category || !shelfLifeHours || !urgency) {
      // Malformed model output — fall back rather than return junk.
      console.warn("[ai] malformed model output, using heuristic:", raw);
      return heuristicClassify(text);
    }

    return {
      category,
      shelfLifeHours,
      urgency,
      summary: String(parsed.summary || text).slice(0, 120),
      source: "groq",
    };
  } catch (err) {
    console.warn("[ai] groq classify failed, using heuristic:", err.message);
    return heuristicClassify(text);
  }
}

module.exports = { classifyFood, heuristicClassify };
