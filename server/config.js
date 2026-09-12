/**
 * Central runtime config. dotenv is optional (and skipped in test/offline runs)
 * so scripts that verify models without any environment can still require it.
 */
let PORT = 5001;
let MONGODB_URI = "mongodb://127.0.0.1:27017/foodrescue";
let CLIENT_ORIGIN = "http://localhost:5173";
let JWT_SECRET = "dev-only-change-me";

try {
  require("dotenv").config();
} catch {
  /* dotenv not installed or init failed — fall back to defaults */
}

PORT = Number(process.env.PORT) || PORT;
MONGODB_URI = process.env.MONGODB_URI || MONGODB_URI;
CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || CLIENT_ORIGIN;
JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET;

module.exports = { PORT, MONGODB_URI, CLIENT_ORIGIN, JWT_SECRET };
