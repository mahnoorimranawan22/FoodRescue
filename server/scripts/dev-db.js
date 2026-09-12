/**
 * Start an in-memory MongoDB for local development/demos.
 *
 * Downloads (once) and runs a real mongod binary on 127.0.0.1:27017 — no
 * system installation needed. The API server's retry loop picks it up
 * automatically within ~10s. Data lives for the lifetime of this process;
 * re-run `npm run seed` after restarting to repopulate.
 *
 * Usage: npm run db   (keep running in the background while developing)
 */
const { MongoMemoryServer } = require("mongodb-memory-server");

async function main() {
  console.log("[dev-db] starting in-memory MongoDB on 127.0.0.1:27017 …");
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017, ip: "127.0.0.1" },
  });
  console.log("[dev-db] ready at", mongod.getUri());
  console.log("[dev-db] the API (npm start) will connect automatically.");

  const shutdown = async () => {
    console.log("[dev-db] stopping …");
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[dev-db] failed:", err.message);
  process.exit(1);
});
