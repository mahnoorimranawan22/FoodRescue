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
  // 6 more users/providers across the international launch cities (idea 15)
  const cityUsers = await Promise.all(
    [
      {
        name: "Riverside Market",
        email: "nyc@foodrescue.test",
        password: "password123",
        role: "provider",
        organizationType: "business",
        isVerified: true,
        location: { type: "Point", coordinates: [-74.0085, 40.7057] },
      },
      {
        name: "Meadow Dairy Co.",
        email: "nyc-dairy@foodrescue.test",
        password: "password123",
        role: "provider",
        organizationType: "business",
        isVerified: true,
        location: { type: "Point", coordinates: [-73.9942, 40.7135] },
      },
      {
        name: "Karachi Community Kitchen",
        email: "karachi@foodrescue.test",
        password: "password123",
        role: "provider",
        organizationType: "charity",
        isVerified: true,
        location: { type: "Point", coordinates: [67.0099, 24.8428] },
      },
      {
        name: "Dubai Food Bank Hub",
        email: "dubai@foodrescue.test",
        password: "password123",
        role: "provider",
        organizationType: "ngo",
        isVerified: true,
        location: { type: "Point", coordinates: [55.2708, 25.2048] },
      },
      {
        name: "Dubai Iftar Initiative",
        email: "dubai-iftar@foodrescue.test",
        password: "password123",
        role: "provider",
        organizationType: "charity",
        isVerified: true,
        location: { type: "Point", coordinates: [55.2925, 25.2356] },
      },
      {
        name: "Hope NYC Kitchen",
        email: "nyc-recipient@foodrescue.test",
        password: "password123",
        role: "recipient",
        organizationType: "charity",
        isVerified: true,
        location: { type: "Point", coordinates: [-73.998, 40.7105] },
      },
    ].map((u) => User.findOneAndUpdate({ email: u.email }, u, { upsert: true, new: true, setDefaultsOnInsert: true }))
  );

  const [riverside, meadow, karachiKitchen, dubaiHub, dubaiIftar] = cityUsers;

  const listingData = [
    {
      provider: bakehouse._id,
      title: "Fresh sourdough loaves (12)",
      category: "Bakery",
      imageUrl: CATEGORY_IMAGES["Bakery"],
      quantity: 12,
      unit: "loaves",
      weightKg: 4.8,
      tags: ["vegetarian"],
      ratingSeed: 4.8,
      reviewSeed: 24,
      pickupWindow: { start: hours(1), end: hours(5) },
      expiryEstimate: hours(40),
      urgencyLevel: "expiring_soon",
      location: { type: "Point", coordinates: [-0.1426, 51.5014] },
      pickupAddress: "42 Portobello Road, Notting Hill, London W11",
    },
    {
      provider: catering._id,
      title: "Hot meal trays — veggie lasagna",
      category: "Prepared Food",
      imageUrl: CATEGORY_IMAGES["Prepared Food"],
      quantity: 40,
      unit: "portions",
      weightKg: 12,
      tags: ["vegetarian", "keep refrigerated"],
      ratingSeed: 4.9,
      reviewSeed: 57,
      pickupWindow: { start: hours(0.5), end: hours(3) },
      expiryEstimate: hours(72),
      urgencyLevel: "urgent",
      location: { type: "Point", coordinates: [-0.1218, 51.5074] },
      pickupAddress: "8 Southwark Street, Bankside, London SE1",
    },
    {
      provider: bakehouse._id,
      title: "Assorted bagels & spreads",
      category: "Bakery",
      imageUrl: IMG_BAGELS,
      quantity: 30,
      unit: "pieces",
      weightKg: 6,
      tags: ["vegetarian"],
      ratingSeed: 4.8,
      reviewSeed: 24,
      pickupWindow: { start: hours(0.5), end: hours(2) },
      expiryEstimate: hours(30),
      urgencyLevel: "urgent",
      location: { type: "Point", coordinates: [-0.1419, 51.5019] },
      pickupAddress: "42 Portobello Road, Notting Hill, London W11",
    },
    {
      provider: catering._id,
      title: "Organic produce crates",
      category: "Produce",
      imageUrl: CATEGORY_IMAGES["Produce"],
      quantity: 8,
      unit: "crates",
      weightKg: 32,
      tags: ["vegan", "vegetarian", "gluten-free"],
      ratingSeed: 4.7,
      reviewSeed: 31,
      pickupWindow: { start: hours(2), end: hours(8) },
      expiryEstimate: hours(72),
      urgencyLevel: "normal",
      location: { type: "Point", coordinates: [-0.1257, 51.5085] },
      pickupAddress: "8 Southwark Street, Bankside, London SE1",
    },
    {
      provider: bakehouse._id,
      title: "Yogurt & dairy assortment",
      category: "Dairy",
      imageUrl: CATEGORY_IMAGES["Dairy"],
      quantity: 25,
      unit: "items",
      weightKg: 9,
      tags: ["vegetarian", "keep refrigerated"],
      ratingSeed: 4.6,
      reviewSeed: 18,
      pickupWindow: { start: hours(1.5), end: hours(5) },
      expiryEstimate: hours(48),
      urgencyLevel: "expiring_soon",
      location: { type: "Point", coordinates: [-0.1433, 51.5008] },
      pickupAddress: "42 Portobello Road, Notting Hill, London W11",
    },
    {
      provider: catering._id,
      title: "Canned goods & dry staples",
      category: "Packaged Goods",
      imageUrl: CATEGORY_IMAGES["Packaged Goods"],
      quantity: 60,
      unit: "items",
      weightKg: 45,
      tags: ["vegan", "vegetarian", "gluten-free"],
      ratingSeed: 4.9,
      reviewSeed: 40,
      pickupWindow: { start: hours(2.5), end: hours(12) },
      expiryEstimate: hours(240),
      urgencyLevel: "normal",
      location: { type: "Point", coordinates: [-0.1225, 51.5079] },
      pickupAddress: "8 Southwark Street, Bankside, London SE1",
    },
    // ── International listings (idea 15): NYC, Karachi, Dubai ──
    {
      provider: riverside._id,
      title: "Organic produce crates",
      category: "Produce",
      imageUrl: CATEGORY_IMAGES["Produce"],
      quantity: 8,
      unit: "crates",
      weightKg: 32,
      tags: ["vegan", "vegetarian", "gluten-free"],
      ratingSeed: 4.7,
      reviewSeed: 31,
      pickupWindow: { start: hours(2), end: hours(8) },
      expiryEstimate: hours(72),
      urgencyLevel: "normal",
      location: { type: "Point", coordinates: [-74.0085, 40.7057] },
      pickupAddress: "150 Essex Street, Lower East Side, New York, NY",
    },
    {
      provider: meadow._id,
      title: "Yogurt & dairy assortment",
      category: "Dairy",
      imageUrl: CATEGORY_IMAGES["Dairy"],
      quantity: 25,
      unit: "items",
      weightKg: 9,
      tags: ["vegetarian", "keep refrigerated"],
      ratingSeed: 4.6,
      reviewSeed: 18,
      pickupWindow: { start: hours(1.5), end: hours(5) },
      expiryEstimate: hours(48),
      urgencyLevel: "expiring_soon",
      location: { type: "Point", coordinates: [-73.9942, 40.7135] },
      pickupAddress: "88 Orchard Street, New York, NY 10002",
    },
    {
      provider: karachiKitchen._id,
      title: "Halal ready-meals — chicken biryani",
      category: "Prepared Food",
      imageUrl: CATEGORY_IMAGES["Prepared Food"],
      quantity: 35,
      unit: "portions",
      weightKg: 14,
      tags: ["halal", "keep refrigerated"],
      ratingSeed: 5.0,
      reviewSeed: 12,
      pickupWindow: { start: hours(1), end: hours(2.5) },
      expiryEstimate: hours(8),
      urgencyLevel: "urgent",
      location: { type: "Point", coordinates: [67.0099, 24.8428] },
      pickupAddress: "Shop 4, Boat Basin, Clifton Block 5, Karachi",
    },
    {
      provider: dubaiHub._id,
      title: "Canned goods & dry staples",
      category: "Packaged Goods",
      imageUrl: CATEGORY_IMAGES["Packaged Goods"],
      quantity: 60,
      unit: "items",
      weightKg: 45,
      tags: ["vegan", "vegetarian", "gluten-free"],
      ratingSeed: 4.9,
      reviewSeed: 40,
      pickupWindow: { start: hours(2.5), end: hours(12) },
      expiryEstimate: hours(240),
      urgencyLevel: "normal",
      location: { type: "Point", coordinates: [55.2708, 25.2048] },
      pickupAddress: "Ground Floor, Zamzama Blvd, DHA Phase 5, Karachi",
    },
    {
      provider: dubaiIftar._id,
      title: "Fresh fruit bowls — iftar surplus",
      category: "Prepared Food",
      imageUrl: CATEGORY_IMAGES["Produce"],
      quantity: 50,
      unit: "portions",
      weightKg: 15,
      tags: ["vegan", "vegetarian", "gluten-free", "halal"],
      ratingSeed: 4.9,
      reviewSeed: 22,
      pickupWindow: { start: hours(2), end: hours(6) },
      expiryEstimate: hours(12),
      urgencyLevel: "expiring_soon",
      location: { type: "Point", coordinates: [55.2925, 25.2356] },
      pickupAddress: "Shop 4, Boat Basin, Clifton Block 5, Karachi",
    },
  ];

  const listings = [];
  for (const data of listingData) {
    // Upsert key: title + provider — the same product name from providers in
    // different cities must remain distinct listings.
    const listing = await FoodListing.findOneAndUpdate(
      { title: data.title, provider: data.provider },
      data,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // Seed realistic provider reputations (idea 9) — idempotent: only when
    // the listing has never been rated.
    if (!listing.reviewCount) {
      listing.rating = data.ratingSeed ?? 0;
      listing.reviewCount = data.reviewSeed ?? 0;
      await listing.save();
    }
    listings.push(listing);
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
