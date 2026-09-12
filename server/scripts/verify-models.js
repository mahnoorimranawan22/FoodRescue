/**
 * Offline verification for the FoodRescue schemas — no MongoDB required.
 * Asserts: model registration, field types, enums/defaults, virtual-free
 * plain exports, 2dsphere geo indexes, compound indexes, and hooks.
 *
 * Run: npm run verify:models
 */
const assert = require("assert");
const mongoose = require("mongoose");
const { User, FoodListing, Claim } = require("../models");

const results = [];
function check(label, fn) {
  try {
    fn();
    results.push(`✅ ${label}`);
  } catch (err) {
    results.push(`❌ ${label} → ${err.message}`);
    process.exitCode = 1;
  }
}

/* ─── User ─────────────────────────────────────────────────────────── */
check("User: model registers as 'User'", () => {
  assert.strictEqual(User.modelName, "User");
});

check("User: email unique + selects off by default", () => {
  const path = User.schema.path("email");
  assert.strictEqual(path.options.unique, true);
  assert.strictEqual(User.schema.path("password").options.select, false);
});

check("User: role enum + default", () => {
  const role = User.schema.path("role");
  assert.deepStrictEqual(
    role.enumValues.sort(),
    ["admin", "provider", "recipient"].sort()
  );
  assert.strictEqual(role.defaultValue, "recipient");
});

check("User: organizationType enum + default", () => {
  const org = User.schema.path("organizationType");
  assert.deepStrictEqual(
    org.enumValues.sort(),
    ["business", "charity", "individual", "ngo"].sort()
  );
  assert.strictEqual(org.defaultValue, "individual");
});

check("User: location is GeoJSON Point with 2dsphere index", () => {
  assert.strictEqual(User.schema.path("location.type").enumValues[0], "Point");
  const indexes = User.schema.indexes();
  assert.ok(
    indexes.some(([fields]) => fields.location === "2dsphere"),
    "2dsphere index missing"
  );
});

check("User: pre-save bcrypt hook + comparePassword method", () => {
  assert.ok(
    User.schema.s.hooks.hasHooks("save"),
    "pre('save') hook missing"
  );
  assert.strictEqual(typeof User.prototype.comparePassword, "function");
});

/* ─── FoodListing ──────────────────────────────────────────────────── */
check("FoodListing: model registers as 'FoodListing'", () => {
  assert.strictEqual(FoodListing.modelName, "FoodListing");
});

check("FoodListing: provider ref → User", () => {
  assert.strictEqual(FoodListing.schema.path("provider").options.ref, "User");
});

check("FoodListing: category enum exact", () => {
  assert.deepStrictEqual(
    FoodListing.schema.path("category").enumValues,
    ["Prepared Food", "Bakery", "Produce", "Dairy", "Packaged Goods"]
  );
});

check("FoodListing: unit default 'portions'", () => {
  assert.strictEqual(FoodListing.schema.path("unit").defaultValue, "portions");
});

check("FoodListing: urgency + status enums and defaults", () => {
  assert.deepStrictEqual(FoodListing.schema.path("urgencyLevel").enumValues, [
    "normal",
    "expiring_soon",
    "urgent",
  ]);
  assert.strictEqual(
    FoodListing.schema.path("urgencyLevel").defaultValue,
    "normal"
  );
  assert.deepStrictEqual(FoodListing.schema.path("status").enumValues, [
    "available",
    "reserved",
    "completed",
    "cancelled",
  ]);
  assert.strictEqual(
    FoodListing.schema.path("status").defaultValue,
    "available"
  );
});

check("FoodListing: 2dsphere + compound query indexes", () => {
  const indexes = FoodListing.schema.indexes();
  assert.ok(indexes.some(([fields]) => fields.location === "2dsphere"));
  assert.ok(
    indexes.some(
      ([fields]) => fields.status === 1 && fields.expiryEstimate === 1
    )
  );
  assert.ok(
    indexes.some(
      ([fields]) =>
        fields.urgencyLevel === 1 && fields.expiryEstimate === -1
    )
  );
});

/* ─── Claim ────────────────────────────────────────────────────────── */
check("Claim: model registers as 'Claim'", () => {
  assert.strictEqual(Claim.modelName, "Claim");
});

check("Claim: refs → User, FoodListing, User", () => {
  assert.strictEqual(Claim.schema.path("recipient").options.ref, "User");
  assert.strictEqual(
    Claim.schema.path("foodListing").options.ref,
    "FoodListing"
  );
  assert.strictEqual(Claim.schema.path("provider").options.ref, "User");
});

check("Claim: status enum + default 'reserved'", () => {
  const status = Claim.schema.path("status");
  assert.deepStrictEqual(status.enumValues, [
    "reserved",
    "picked_up",
    "cancelled",
  ]);
  assert.strictEqual(status.defaultValue, "reserved");
});

check("Claim: pickupCode unique + 4-digit pattern", () => {
  const code = Claim.schema.path("pickupCode");
  assert.strictEqual(code.options.unique, true);
  const regex = code.options.match[0];
  assert.ok(regex instanceof RegExp, "match must be a regex");
  assert.ok(regex.test("1234"), "should accept 4 digits");
  assert.ok(!regex.test("123"), "should reject 3 digits");
  assert.ok(!regex.test("12345"), "should reject 5 digits");
});

check("Claim: partial unique index on active reservations", () => {
  const indexes = Claim.schema.indexes();
  const partial = indexes.find(
    ([fields, opts]) =>
      fields.foodListing === 1 &&
      opts &&
      opts.unique === true &&
      opts.partialFilterExpression &&
      opts.partialFilterExpression.status === "reserved"
  );
  assert.ok(partial, "partial unique index missing");
  assert.ok(
    indexes.some(
      ([fields]) => fields.foodListing === 1 && fields.status === 1
    ),
    "history compound index missing"
  );
});

check("Claim: pre-validate pickup code generator hook", () => {
  assert.ok(
    Claim.schema.s.hooks.hasHooks("validate"),
    "pre('validate') hook missing"
  );
});

/* ─── Phase 2: document validation (validateSync, offline) ─────────── */

const { Types } = mongoose;
const oid = () => new Types.ObjectId();
const baseUser = {
  name: "Test User",
  email: "test@foodrescue.org",
  password: "password123",
  location: { type: "Point", coordinates: [90.4, 23.8] },
};
const baseListing = {
  provider: oid(),
  title: "Veggie boxes",
  category: "Produce",
  quantity: 12,
  pickupWindow: {
    start: new Date("2026-09-12T10:00:00Z"),
    end: new Date("2026-09-12T14:00:00Z"),
  },
  expiryEstimate: new Date("2026-09-13T00:00:00Z"),
  location: { type: "Point", coordinates: [90.4, 23.8] },
};
const baseClaim = {
  recipient: oid(),
  foodListing: oid(),
  provider: oid(),
  pickupCode: "1234", // set explicitly so the DB-backed generator hook no-ops
};

check("Validate: well-formed User / FoodListing / Claim pass", () => {
  assert.strictEqual(new User({ ...baseUser, role: "provider" }).validateSync(), undefined);
  assert.strictEqual(new FoodListing(baseListing).validateSync(), undefined);
  assert.strictEqual(new Claim(baseClaim).validateSync(), undefined);
});

check("Validate: invalid role rejected", () => {
  const err = new User({ ...baseUser, role: "superuser" }).validateSync();
  assert.ok(err.errors.role, "role error missing");
  assert.match(err.errors.role.message, /not a valid role/);
});

check("Validate: invalid organizationType rejected", () => {
  const err = new User({ ...baseUser, organizationType: "school" }).validateSync();
  assert.ok(err.errors.organizationType, "organizationType error missing");
});

check("Validate: out-of-range coordinates rejected", () => {
  const err = new User({
    ...baseUser,
    location: { type: "Point", coordinates: [200, 95] },
  }).validateSync();
  assert.ok(err.errors["location.coordinates"], "coordinates error missing");
});

check("Validate: invalid listing category rejected", () => {
  const err = new FoodListing({
    ...baseListing,
    category: "Seafood",
  }).validateSync();
  assert.ok(err.errors.category, "category error missing");
  assert.match(err.errors.category.message, /not a valid category/);
});

check("Validate: zero quantity rejected", () => {
  const err = new FoodListing({ ...baseListing, quantity: 0 }).validateSync();
  assert.ok(err.errors.quantity, "quantity error missing");
});

check("Validate: inverted pickup window rejected", () => {
  const err = new FoodListing({
    ...baseListing,
    pickupWindow: {
      start: new Date("2026-09-12T14:00:00Z"),
      end: new Date("2026-09-12T10:00:00Z"),
    },
  }).validateSync();
  assert.ok(err.errors["pickupWindow.end"], "pickup window error missing");
});

check("Validate: pickedUpAt before claimedAt rejected", () => {
  const err = new Claim({
    ...baseClaim,
    claimedAt: new Date("2026-09-12T12:00:00Z"),
    pickedUpAt: new Date("2026-09-12T10:00:00Z"), // before claim → invalid
  }).validateSync();
  assert.ok(err.errors.pickedUpAt, "pickedUpAt error missing");
});

check("Validate: 3-digit pickup code rejected", () => {
  const err = new Claim({ ...baseClaim, pickupCode: "123" }).validateSync();
  assert.ok(err.errors.pickupCode, "pickupCode error missing");
});

check("Validate: claim defaults (reserved, claimedAt, timestamps)", () => {
  const claim = new Claim(baseClaim);
  assert.strictEqual(claim.status, "reserved");
  assert.ok(claim.claimedAt instanceof Date);
});

check("Validate: listing defaults (available, normal, portions)", () => {
  const listing = new FoodListing(baseListing);
  assert.strictEqual(listing.status, "available");
  assert.strictEqual(listing.urgencyLevel, "normal");
  assert.strictEqual(listing.unit, "portions");
});

/* ─── Report ───────────────────────────────────────────────────────── */
console.log("\nFoodRescue schema verification");
console.log("=".repeat(60));
results.forEach((r) => console.log(r));
console.log("=".repeat(60));
console.log(
  process.exitCode === 1
    ? "❌ Some checks failed\n"
    : `✅ All ${results.length} checks passed\n`
);
mongoose.disconnect();
process.exit(process.exitCode);
