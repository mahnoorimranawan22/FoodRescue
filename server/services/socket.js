/**
 * Real-time messaging hub (Socket.IO).
 *
 * Owns the single Socket.IO server instance attached to the HTTP server.
 * Three layers of delivery:
 *
 *   emit(event, payload)                  — global broadcast (public feeds)
 *   toUser(userId, event, payload)        — targeted: private `user:<id>` room
 *   notifyNearbyRecipients(listing)       — geo-targeted fan-out to recipients
 *                                           within range of a new listing
 *
 * Authentication: clients pass their JWT in the handshake
 * (`io(url, { auth: { token } })`). Verified tokens join the user's private
 * room, so notifications reach exactly the right person — a provider hears
 * `listing:claimed` the moment someone reserves their food, and nearby
 * recipients hear `listing:created` the moment fresh surplus is published.
 * Anonymous sockets stay connected for the public broadcast feed only.
 */
const { Server } = require("socket.io");
const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

let io = null;

/** Radius for "nearby recipient" notifications on a new listing (meters). */
const NEARBY_RECIPIENT_RADIUS_M = 15_000;

function initSockets(httpServer) {
  try {
    io = new Server(httpServer, {
      cors: { origin: true, methods: ["GET", "POST"] },
      transports: ["websocket", "polling"],
    });

    io.on("connection", (socket) => {
      // ── Authentication (optional) ────────────────────────────────────
      // Verified JWT → join the private user room for targeted events.
      const token = socket.handshake.auth?.token;
      if (token && typeof token === "string") {
        const payload = verifyToken(token);
        if (payload?.sub) {
          socket.data.userId = String(payload.sub);
          socket.join(`user:${payload.sub}`);
          socket.emit("authenticated", { userId: payload.sub });
        }
      }

      const who = socket.data.userId || "anonymous";
      console.log(`[rt] client connected (${who}, ${io.engine.clientsCount} online)`);

      // Explicit join (re-auth after token refresh) — mirrors the handshake.
      socket.on("auth", ({ token: t } = {}) => {
        const p = t ? verifyToken(t) : null;
        if (p?.sub) {
          socket.data.userId = String(p.sub);
          socket.join(`user:${p.sub}`);
          socket.emit("authenticated", { userId: p.sub });
        } else {
          socket.emit("authenticated", { error: "invalid token" });
        }
      });

      socket.on("disconnect", () => {
        console.log(`[rt] client left (${io.engine.clientsCount} online)`);
      });
    });

    console.log("[rt] Socket.io ready — private rooms + targeted events enabled");
    return io;
  } catch (err) {
    console.warn("[rt] socket.io unavailable — realtime disabled:", err.message);
    io = null;
    return null;
  }
}

/** Global broadcast; silently no-ops when realtime is off. */
function emit(event, payload) {
  if (io) io.emit(event, payload);
}

/** Targeted emit into a user's private room. */
function toUser(userId, event, payload) {
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Broadcast `listing:created` to recipients near a newly published listing.
 * Each recipient gets their own distance (km) computed by $geoNear.
 * Resolves with the number of recipients notified. Fire-and-forget safe.
 */
async function notifyNearbyRecipients(listing) {
  if (!io || !listing?.location?.coordinates) return 0;
  try {
    const recipients = await User.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: listing.location.coordinates, // [lng, lat]
          },
          distanceField: "distanceMeters",
          maxDistance: NEARBY_RECIPIENT_RADIUS_M,
          query: { role: "recipient" },
          spherical: true,
        },
      },
      { $limit: 100 },
    ]);

    const base = {
      type: "created",
      listingId: String(listing._id),
      title: listing.title,
      category: listing.category,
      urgencyLevel: listing.urgencyLevel,
      imageUrl: listing.imageUrl || null,
    };
    for (const u of recipients) {
      toUser(u._id, "listing:created", {
        ...base,
        distanceKm: Math.round(u.distanceMeters / 100) / 10,
      });
    }
    return recipients.length;
  } catch (err) {
    console.warn("[rt] nearby notify failed:", err.message);
    return 0;
  }
}

/**
 * Emit `listing:claimed` to the provider's private room the instant a
 * recipient reserves their listing. Carries everything the provider needs
 * for handover: who claimed it and the 4-digit pickup code to verify.
 */
function notifyProviderOfClaim({ providerId, listingId, listingTitle, recipientName, pickupCode }) {
  toUser(providerId, "listing:claimed", {
    type: "claimed",
    listingId: String(listingId),
    listingTitle: listingTitle || "Surplus listing",
    recipientName: recipientName || "A recipient",
    pickupCode: pickupCode || null,
    at: new Date().toISOString(),
  });
}

module.exports = {
  initSockets,
  initRealtime: initSockets, // backwards-compatible alias
  emit,
  toUser,
  notifyNearbyRecipients,
  notifyProviderOfClaim,
};
