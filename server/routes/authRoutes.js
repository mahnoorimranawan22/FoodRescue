/**
 * /api/auth routes — thin wiring: controller handlers + middleware.
 * A small in-memory rate limiter throttles credential endpoints to slow
 * brute-force attempts (per-IP; resets on server restart — for production,
 * back this with a store like Redis).
 */
const express = require("express");
const controller = require("../controllers/authController");
const { protect } = require("../middleware/auth");

const router = express.Router();

/** Fixed-window per-IP limiter (default: 10 attempts / 5 min). */
function rateLimit({ windowMs = 5 * 60 * 1000, max = 10 } = {}) {
  const hits = new Map(); // ip → [timestamps]
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      return res.status(429).json({
        message: "Too many attempts — please try again in a few minutes",
      });
    }
    list.push(now);
    hits.set(ip, list);
    return next();
  };
}

// POST /api/auth/register — bcrypt hashing happens in the User model hook
router.post("/register", rateLimit({ max: 10 }), controller.register);

// POST /api/auth/login — returns JWT { sub: id, role, email }
router.post("/login", rateLimit({ max: 10 }), controller.login);

// GET /api/auth/me — protected profile of the logged-in user
router.get("/me", protect, controller.me);

module.exports = router;
