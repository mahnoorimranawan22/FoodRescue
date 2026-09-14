/**
 * /api/ai — AI-powered suggestions for providers.
 *
 *   POST /api/ai/classify  { title?, description? }
 *     → { classification: { category, shelfLifeHours, urgency, summary, source } }
 *
 * Backed by Groq (llama-3.3-70b-versatile) via services/groqService. When no
 * GROQ_API_KEY is set the service's heuristic fallback answers with the same
 * JSON shape, so the endpoint always works (source: "heuristic" vs "groq").
 *
 * Authenticated + rate-limited: every call costs tokens/money, so abuse
 * protection matters even though the payload is tiny.
 */
const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const { classifyFood } = require("../services/groqService");

const router = express.Router();

/** Fixed-window per-IP limiter — same pattern as authRoutes. */
function rateLimit({ windowMs = 60 * 1000, max = 20 } = {}) {
  const hits = new Map(); // ip → { count, resetAt }
  return (req, res, next) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({
        message: "Too many AI requests — try again in a minute",
      });
    }
    return next();
  };
}

router.post(
  "/classify",
  protect,
  authorize("provider", "recipient", "admin"),
  rateLimit({ windowMs: 60 * 1000, max: 20 }),
  async (req, res, next) => {
    try {
      const { title, description } = req.body || {};
      const text = String(description || title || "").trim();
      if (!text) {
        return res
          .status(400)
          .json({ message: "Provide a title or description to classify" });
      }
      if (text.length > 500) {
        return res
          .status(400)
          .json({ message: "Description too long (max 500 characters)" });
      }

      const classification = await classifyFood(text);
      return res.json({ classification });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
