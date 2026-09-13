const mongoose = require("mongoose");

/**
 * FoodRescue — FoodListing model
 * A surplus food post created by a provider (restaurant, grocer, event...).
 * Recipients discover these via geo queries filtered by category/status and
 * sorted by urgency + expiry.
 */

const CATEGORIES = [
  "Prepared Food",
  "Bakery",
  "Produce",
  "Dairy",
  "Packaged Goods",
];
const URGENCY_LEVELS = ["normal", "expiring_soon", "urgent"];
const STATUSES = ["available", "reserved", "completed", "cancelled"];
// Dietary & safety tags (idea 2) — cross-cultural food trust markers
const TAGS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "nut-free",
  "keep refrigerated",
  "contains allergens",
];

// Uploads arrive as data URLs — cap them so a request can't balloon past
// the 1 MB JSON body limit (client downsizes to ≤900px JPEG first).
const MAX_IMAGE_CHARS = 700_000;

// Declared as an explicit schema (not an inline object literal): in Mongoose 8,
// document-bound custom validators on inline subdocs receive the ROOT doc as
// `this`, silently breaking cross-field checks like end > start.
const pickupWindowSchema = new mongoose.Schema(
  {
    start: {
      type: Date,
      required: [true, "Pickup window start is required"],
    },
    end: {
      type: Date,
      required: [true, "Pickup window end is required"],
      validate: {
        validator: function validateEnd(end) {
          // `this` is the pickupWindow subdocument
          return !this.start || end > this.start;
        },
        message: "Pickup window end must be after start",
      },
    },
  },
  { _id: false }
);

const foodListingSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [140, "Title cannot exceed 140 characters"],
    },
    category: {
      type: String,
      enum: {
        values: CATEGORIES,
        message: "`{VALUE}` is not a valid category",
      },
      required: [true, "Category is required"],
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    unit: { type: String, default: "portions", trim: true },
    // Approximate weight — powers CO₂-avoided math on the impact dashboard
    weightKg: {
      type: Number,
      min: [0, "Weight cannot be negative"],
      default: 0,
    },
    // idea 2 — dietary & safety tags shown as chips on every card
    tags: {
      type: [String],
      enum: {
        values: TAGS,
        message: "`{VALUE}` is not a valid tag",
      },
      default: [],
      index: true,
    },
    // Rolling provider rating (idea 9), updated when claims are reviewed
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },
    // Photo: remote URL or an uploaded data:image (client downsizes before send)
    imageUrl: {
      type: String,
      trim: true,
      validate: {
        validator: (v) =>
          !v || /^https?:\/\/\S+$/.test(v) || /^data:image\/(png|jpe?g|webp);base64,/.test(v),
        message: "imageUrl must be an https URL or an uploaded image",
      },
    },
    pickupWindow: {
      type: pickupWindowSchema,
      required: [true, "Pickup window is required"],
    },
    expiryEstimate: {
      type: Date,
      required: [true, "Expiry estimate is required"],
    },
    urgencyLevel: {
      type: String,
      enum: {
        values: URGENCY_LEVELS,
        message: "`{VALUE}` is not a valid urgency level",
      },
      default: "normal",
      index: true,
    },
    status: {
      type: String,
      enum: { values: STATUSES, message: "`{VALUE}` is not a valid status" },
      default: "available",
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: [
          function isLocationProvided() {
            const loc = this?.location;
            return loc != null && (loc.type != null || loc.coordinates != null);
          },
          "Location type is required when a location is given",
        ],
      },
      coordinates: {
        type: [Number], // [longitude, latitude] — GeoJSON order
        required: [
          function isLocationProvided() {
            const loc = this?.location;
            return loc != null && (loc.type != null || loc.coordinates != null);
          },
          "Coordinates are required when a location is given",
        ],
        validate: {
          validator: ([lng, lat]) =>
            lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
          message: "Coordinates out of range (lng ±180, lat ±90)",
        },
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Geo index — "surplus food within 5 km of me"
foodListingSchema.index({ location: "2dsphere" });

// Compound index for the hot Discover-page query:
// find available listings, soonest expiry first
foodListingSchema.index({ status: 1, expiryEstimate: 1 });
// Urgency feed: most urgent + soonest-expiring available listings first
foodListingSchema.index({ urgencyLevel: 1, expiryEstimate: -1 });

module.exports = mongoose.model("FoodListing", foodListingSchema);
