/**
 * idea 6 — Socket.io realtime hub.
 * `initRealtime(server)` attaches the socket server; `emit(event, payload)`
 * is safe to call from anywhere (no-op before init). The client updates the
 * Discover feed the moment a listing is claimed/completed/released.
 */
let io = null;

function initRealtime(httpServer) {
  try {
    const { Server } = require("socket.io");
    io = new Server(httpServer, {
      cors: { origin: true, methods: ["GET", "POST"] },
      transports: ["websocket", "polling"],
    });
    io.on("connection", (socket) => {
      console.log(`[rt] client connected (${io.engine.clientsCount} online)`);
      socket.on("disconnect", () => {
        console.log(`[rt] client left (${io.engine.clientsCount} online)`);
      });
    });
    console.log("[rt] Socket.io ready");
    return io;
  } catch (err) {
    console.warn("[rt] socket.io unavailable — realtime disabled:", err.message);
    io = null;
    return null;
  }
}

/** Emit to all connected clients; silently no-op when realtime is off. */
function emit(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { initRealtime, emit };
