/**
 * JWT issuing + verification, extracted from routes for reuse in middleware.
 * Falls back to a tiny HMAC shim only when `jsonwebtoken` is not installed,
 * so the API can boot in demo environments with zero network access.
 */

let jwtLib = null;
try {
  jwtLib = require("jsonwebtoken");
} catch {
  jwtLib = null;
}

const { JWT_SECRET } = require("../config");

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64"
  ).toString("utf8");
}

/** Native-crypto HMAC-SHA256 fallback (no external deps). */
function hmacSign(data) {
  return b64url(require("crypto").createHmac("sha256", JWT_SECRET).update(data).digest());
}

function hmacVerify(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, payload, sig] = parts;
  const expected = hmacSign(`${head}.${payload}`);
  if (sig.length !== expected.length || sig !== expected) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(payload));
    if (parsed.exp && Date.now() / 1000 > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

const EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days

function signToken(user) {
  const payload = {
    sub: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name, // travels with every request for display purposes
  };
  if (jwtLib) {
    return jwtLib.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  }
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + EXPIRES_IN_SECONDS,
    })
  );
  return `${header}.${body}.${hmacSign(`${header}.${body}`)}`;
}

function verifyToken(token) {
  if (jwtLib) {
    try {
      return jwtLib.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  }
  return hmacVerify(token);
}

module.exports = { signToken, verifyToken };
