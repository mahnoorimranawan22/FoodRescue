const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * FoodRescue — User model
 * Roles: providers (donate surplus food), recipients (claim it), admins (moderate).
 * Location is a GeoJSON Point ([longitude, latitude]) indexed with 2dsphere
 * for geo-queries ("charities near me", "listings within X km").
 */

const ROLES = ["provider", "recipient", "admin"];
const ORGANIZATION_TYPES = ["individual", "charity", "ngo", "business"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [120, "Name cannot exceed 120 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // never returned unless explicitly .select("+password")
    },
    role: {
      type: String,
      enum: { values: ROLES, message: "`{VALUE}` is not a valid role" },
      default: "recipient",
      index: true,
    },
    organizationType: {
      type: String,
      enum: {
        values: ORGANIZATION_TYPES,
        message: "`{VALUE}` is not a valid organization type",
      },
      default: "individual",
    },
    isVerified: { type: Boolean, default: false },
    phone: {
      type: String,
      trim: true,
      match: [/^[+()\-\s\d]{7,20}$/, "Please provide a valid phone number"],
    },
    // Optional GeoJSON Point — a GeoJSON type itself has no concept of
    // "missing", so required-ness is expressed on the subpaths instead.
    // NOTE: this is an inline object literal, which flattens the paths to
    // location.type / location.coordinates (see FoodListing.js for the
    // explicit-schema variant that keeps them nested).
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

// Geo index — enables $near / $geoWithin queries on users
userSchema.index({ location: "2dsphere" });

// Hash password before save (only when modified)
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare a candidate password against the stored hash
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak credentials or hashes in serialized output
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
