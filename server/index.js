/**
 * FoodRescue API — Express entry point.
 * Serves /api/auth, /api/listings, /api/claims, /api/stats.
 * DB connection is optional at boot (offline-tolerant demos); routes that
 * need Mongo return clean 503s until it is reachable.
 */
const express = require("express");
const http = require("http");
const config = require("./config");
const { connectDB, isConnected } = require("./config/db");
const { initSockets } = require("./services/socket");

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS (hand-rolled to avoid needing the cors package)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", config.CLIENT_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

// Graceful 503 while Mongo is offline (instead of hanging or crashing).
// STRICT: only readyState 1 (connected) passes. State 2 (connecting) also
// 503s — otherwise requests slip through mid-retry and fail with confusing
// 401/500s instead of the clean "demo mode" signal the client expects.
app.use((req, res, next) => {
  if (!isConnected() && req.path.startsWith("/api")) {
    return res
      .status(503)
      .json({ message: "Database not connected — API running in limited mode" });
  }
  return next();
});

// ── Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/listings", require("./routes/listingRoutes"));
app.use("/api/claims", require("./routes/claimRoutes"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/ai", require("./routes/aiRoutes"));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: isConnected() ? 1 : 0, // 1 = connected
    uptime: process.uptime(),
  });
});

// 404 for unknown API paths
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Central error handler — keep responses JSON, never leak stack traces
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[error]", err.message);
  res.status(500).json({ message: "Internal server error" });
});

async function start() {
  try {
    await connectDB();
  } catch {
    console.warn(
      "[db] starting in limited mode — background reconnect is active"
    );
  }

  // Attach Socket.io to the HTTP server: global feed + private user rooms
  // for targeted `listing:created` / `listing:claimed` notifications.
  const server = http.createServer(app);
  initSockets(server);
  server.listen(config.PORT, () => {
    console.log(`[api] FoodRescue API listening on http://localhost:${config.PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
