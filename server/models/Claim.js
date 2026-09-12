const mongoose = require("mongoose");

/**
 * FoodRescue — Claim model
 * Tracks the reservation lifecycle of a listing: a recipient reserves surplus
 * food, receives a 4-digit pickup code, and the provider confirms handover.
 * Status flow: reserved → picked_up | cancelled.
 */

const CLAIM_STATUSES = ["reserved", "picked_up", "cancelled"];

const claimSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient is required"],
      index: true,
    },
    foodListing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodListing",
      required: [true, "Food listing is required"],
      // indexed via the compound + partial unique indexes below
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider is required"],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: CLAIM_STATUSES,
        message: "`{VALUE}` is not a valid claim status",
      },
      default: "reserved",
      index: true,
    },
    pickupCode: {
      type: String,
      unique: true,
      match: [/^\d{4}$/, "Pickup code must be exactly 4 digits"],
    },
    claimedAt: { type: Date, default: Date.now },
    pickedUpAt: {
      type: Date,
      validate: {
        validator: function validatePickedUp(pickedUpAt) {
          // `function` so `this` is the claim being validated
          return !pickedUpAt || !this.claimedAt || pickedUpAt >= this.claimedAt;
        },
        message: "pickedUpAt cannot be before claimedAt",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Enforce reservation consistency: at most ONE active claim per listing.
// Cancelled claims are excluded, so a listing can be re-claimed afterwards.
claimSchema.index(
  { foodListing: 1 },
  { unique: true, partialFilterExpression: { status: "reserved" } }
);

// Full claim history per listing, any status (the partial index above only
// serves queries that filter on status: "reserved").
claimSchema.index({ foodListing: 1, status: 1 });

// Generate a unique 4-digit pickup code before validation on create.
// Uses the same regex as the field to guarantee the generated code passes.
claimSchema.pre("validate", async function generatePickupCode(next) {
  if (this.pickupCode) return next();
  const codePattern = /^\d{4}$/;
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = String(
        Math.floor(1000 + Math.random() * 9000) // 1000–9999
      );
      if (!codePattern.test(candidate)) continue; // defensive, never hit
      const existing = await this.constructor.exists({
        pickupCode: candidate,
      });
      if (!existing) {
        this.pickupCode = candidate;
        return next();
      }
    }
    // 10 collisions in a row is astronomically unlikely (10k space);
    // fall back to autoIndex-style failure so callers can retry safely.
    return next(
      new Error("Could not generate a unique pickup code — please retry")
    );
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Claim", claimSchema);
