/**
 * Seed the FoodRescue DB with demo users, listings, and one claim.
 * Idempotent: unique emails/titles prevent duplicates on re-run.
 * Usage: npm run seed  (requires a reachable MongoDB)
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../config");
const { User, FoodListing, Claim } = require("../models");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Curated stock photography (same catalog as client/src/lib/images.js).
const IMG = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=70`;
const CATEGORY_IMAGES = {
  "Prepared Food": IMG("1574894709920-11b28e7367e3"),
  Bakery: IMG("1509440159596-0249088772ff"),
  Produce: IMG("1512621776951-a57141f2eefd"),
  Dairy: IMG("1550583724-b2692b85b150"),
  "Packaged Goods": IMG("1583258292688-d0213dc5a3a8"),
};
const IMG_BAGELS = IMG("1551183053-bf91a1d81141");

async function main() {
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
  console.log("[seed] connected");

  const users = await Promise.all(
    [
      {
        name: "Corner Bakehouse",
        email: "provider@foodrescue.test",
        password: "password123",
        role: "provider",
        organizationType: "business",
        isVerified: true,
        phone: "+1 555 010 2233",
        location: { type: "Point", coordinates: [-0.1426, 51.5014] },
      },
      {
        name: "Green Fork Catering",
        email: "catering@foodrescue.test",
        password: "password123",
        role: "provider",
        organizationType: "business",
        isVerified: true,
        location: { type: "Point", coordinates: [-0.1218, 51.5074] },
      },
      {
        name: "Hope Community Kitchen",
        email: "recipient@foodrescue.test",
        password: "password123",
        role: "recipient",
        organizationType: "charity",
        isVerified: true,
        location: { type: "Point", coordinates: [-0.1099, 51.5155] },
      },
      {
        name: "FoodRescue Admin",
        email: "admin@foodrescue.test",
        password: "password123",
        role: "admin",
        organizationType: "individual",
        isVerified: true,
        location: { type: "Point", coordinates: [-0.1276, 51.5072] },
      },
    ].map((u) => User.findOneAndUpdate({ email: u.email }, u, { upsert: true, new: true, setDefaultsOnInsert: true }))
  );

  // findOneAndUpdate (upsert) bypasses the pre("save") bcrypt hook, and
  // assigning the same plaintext would no-op isModified("password") — so
  // write the bcrypt hash DIRECTLY via findByIdAndUpdate. Idempotent:
  // properly hashed docs ($2… prefix) are detected and left untouched.
  const seededHash = await bcrypt.hash("password123", 12); // seed credential
  for (const user of users) {
    const doc = await User.findById(user._id).select("+password");
    if (doc && !doc.password?.startsWith("$2")) {
      await User.findByIdAndUpdate(user._id, { password: seededHash });
      console.log("[seed] hashed password for:", user.email);
    }
  }

  const [bakehouse, catering, kitchen] = users;

  const hours = (n) => new Date(Date.now() + n * 3600 * 1000);
  const listingData = [
    {
      provider: bakehouse._id,
      title: "Fresh sourdough loaves (12)",
      category: "Bakery",
      imageUrl: CATEGORY_IMAGES["Bakery"],
      quantity: 12,
      unit: "loaves",
      pickupWindow: { start: hours(1), end: hours(5) },
      expiryEstimate: hours(40),
      urgencyLevel: "expiring_soon",
      location: { type: "Point", coordinates: [-0.1426, 51.5014] },
    },
    {
      provider: catering._id,
      title: "Hot meal trays — veggie lasagna",
      category: "Prepared Food",
      imageUrl: CATEGORY_IMAGES["Prepared Food"],
      quantity: 40,
      unit: "portions",
      pickupWindow: { start: hours(0.5), end: hours(3) },
      expiryEstimate: hours(72),
      urgencyLevel: "urgent",
      location: { type: "Point", coordinates: [-0.1218, 51.5074] },
    },
    {
      provider: bakehouse._id,
      title: "Assorted bagels & spreads",
      category: "Bakery",
      imageUrl: IMG_BAGELS,
      quantity: 30,
      unit: "pieces",
      pickupWindow: { start: hours(0.5), end: hours(2) },
      expiryEstimate: hours(30),
      urgencyLevel: "urgent",
      location: { type: "Point", coordinates: [-0.1419, 51.5019] },
    },
    {
      provider: catering._id,
      title: "Organic produce crates",
      category: "Produce",
      imageUrl: CATEGORY_IMAGES["Produce"],
      quantity: 8,
      unit: "crates",
      pickupWindow: { start: hours(2), end: hours(8) },
      expiryEstimate: hours(72),
      urgencyLevel: "normal",
      location: { type: "Point", coordinates: [-0.1257, 51.5085] },
    },
    {
      provider: bakehouse._id,
      title: "Yogurt & dairy assortment",
      category: "Dairy",
      imageUrl: CATEGORY_IMAGES["Dairy"],
      quantity: 25,
      unit: "items",
      pickupWindow: { start: hours(1.5), end: hours(5) },
      expiryEstimate: hours(48),
      urgencyLevel: "expiring_soon",
      location: { type: "Point", coordinates: [-0.1433, 51.5008] },
    },
    {
      provider: catering._id,
      title: "Canned goods & dry staples",
      category: "Packaged Goods",
      imageUrl: CATEGORY_IMAGES["Packaged Goods"],
      quantity: 60,
      unit: "items",
      pickupWindow: { start: hours(2.5), end: hours(12) },
      expiryEstimate: hours(240),
      urgencyLevel: "normal",
      location: { type: "Point", coordinates: [-0.1225, 51.5079] },
    },
  ];

  const listings = [];
  for (const data of listingData) {
    listings.push(
      await FoodListing.findOneAndUpdate(
        { title: data.title },
        data,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    );
  }
  console.log(`[seed] users: ${users.length}, listings: ${listings.length}`);

  // One demo reservation (idempotent: only if none reserved on that listing)
  const existingClaim = await Claim.findOne({
    foodListing: listings[3]._id,
    status: "reserved",
  });
  if (!existingClaim) {
    await Claim.create({
      recipient: kitchen._id,
      foodListing: listings[3]._id,
      provider: listings[3].provider,
    });
    listings[3].status = "reserved";
    await listings[3].save();
    console.log("[seed] demo claim created on:", listings[3].title);
  }

  console.log("[seed] done");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
