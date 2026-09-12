/**
 * MongoDB connection via Mongoose — Atlas-ready.
 *
 * Connection target comes from config (env-first):
 *   • Local dev:      MONGODB_URI=mongodb://127.0.0.1:27017/foodrescue
 *   • MongoDB Atlas:  MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/foodrescue
 *     (create the user in Atlas → Database Access, and allowlist your IP in
 *      Network Access; everything else is identical from this side.)
 *
 * Behaviour:
 *   • connectDB() resolves once connected, throws if the first attempt fails.
 *   • After any unexpected disconnect, exponential-backoff reconnection runs
 *     in the background (5s → 30s cap) so a late/returning DB is picked up.
 *   • isConnected() lets middleware/routes degrade gracefully (503s) instead
 *     of hanging on a dead connection.
 */
const mongoose = require("mongoose");
const config = require("../config");

const OPTIONS = {
  serverSelectionTimeoutMS: 8000, // fail fast, never hang a request
  maxPoolSize: 10, // default pool; plenty for this app
};

let retryTimer = null;
let backoffMs = 5000;
const MAX_BACKOFF_MS = 30000;

function isConnected() {
  return mongoose.connection.readyState === 1;
}

function scheduleReconnect(uri) {
  if (retryTimer) return; // already scheduled
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    try {
      await mongoose.connect(uri, OPTIONS);
      backoffMs = 5000;
      console.log("[db] reconnected:", mongoose.connection.host);
      attachWatchdogs(uri);
    } catch {
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      scheduleReconnect(uri);
    }
  }, backoffMs);
}

function attachWatchdogs(uri) {
  const conn = mongoose.connection;
  conn.on("disconnected", () => {
    console.warn("[db] disconnected — retrying in background");
    scheduleReconnect(uri);
  });
  conn.on("error", (err) => console.error("[db] error:", err.message));
}

async function connectDB(uri = config.MONGODB_URI) {
  if (isConnected()) return mongoose.connection;
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(uri, OPTIONS);
    console.log(
      `[db] connected: ${mongoose.connection.host}/${mongoose.connection.name}`
    );
    attachWatchdogs(uri);
    return mongoose.connection;
  } catch (err) {
    console.error("[db] connection failed:", err.message);
    scheduleReconnect(uri); // keep trying in the background
    throw err; // let the caller decide how to boot (API starts anyway)
  }
}

async function disconnectDB() {
  if (retryTimer) clearTimeout(retryTimer);
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, isConnected };
