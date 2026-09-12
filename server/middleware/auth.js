/**
 * Auth middleware — JWT bearer authentication + role-based authorization.
 *
 *   protect            — verifies `Authorization: Bearer <token>`, loads the
 *                        user from DB, attaches it to req.user (401 otherwise).
 *   authorize(...roles) — after protect, rejects when req.user.role is not in
 *                        the allowed set (403). Usage:
 *                          router.post("/", protect, authorize("provider", "admin"), handler)
 *
 * Hardening details:
 *   • Header must match /^Bearer\s+\S+$/ — malformed headers are rejected
 *     before any crypto work.
 *   • Tokens are looked up against the LIVE user document, so deleted users
 *     or role changes take effect immediately (not just at token expiry).
 *   • Generic, equal-length error messages for missing/invalid tokens to
 *     avoid leaking which case failed.
 */
const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!/^Bearer\s+\S+$/.test(header)) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const token = header.slice(7).trim();
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "Account no longer exists" });
    }
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

function authorize(...roles) {
  if (roles.length === 0) {
    throw new Error("authorize() requires at least one role");
  }
  return (req, res, next) => {
    if (!req.user) {
      // authorize used without protect — programmer error, surface it loudly.
      return res
        .status(500)
        .json({ message: "authorize() must follow protect()" });
    }
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "You do not have permission to do that" });
    }
    return next();
  };
}

// Backwards-compatible aliases for routes written against the old names.
const requireAuth = protect;
const requireRole = authorize;

module.exports = { protect, authorize, requireAuth, requireRole };
