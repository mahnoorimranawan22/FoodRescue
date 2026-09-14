/**
 * Listing controllers — publish, discover, and manage surplus food.
 *
 * Extracted from routes/listings.js so routes stay thin wiring. Every handler
 * follows the same contract: validated input → Mongo query → JSON response,
 * with errors forwarded to the central error handler via `next(err)`.
 */
const mongoose = require("mongoose");
const FoodListing = require("../models/FoodListing");
const {
  emit,
  notifyNearbyRecipients,
} = require("../services/socket");

const CATEGORIES = [
  "Prepared Food",
  "Bakery",
  "Produce",
  "Dairy",
  "Packaged Goods",
];
const URGENCY_LEVELS = ["normal", "expiring_soon", "urgent"];
const ALLOWED_TAGS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "nut-free",
  "keep refrigerated",
  "contains allergens",
];
// data URLs count against the JSON body limit — cap uploads defensively
const MAX_IMAGE_CHARS = 700_000;

// Launch cities for the international city filter — keep in sync with
// client/src/lib/geo.js
const CITIES = {
  london: { lat: 51.5074, lng: -0.1278 },
  nyc: { lat: 40.7128, lng: -74.006 },
  karachi: { lat: 24.8607, lng: 67.0011 },
  dubai: { lat: 25.2048, lng: 55.2708 },
};

/**
 * Attach a friendly providerName to a listing document/lean object.
 */
function withProviderName(listing) {
  return {
    ...listing,
    providerName: listing.provider?.name || "Local provider",
    provider: listing.provider?._id || listing.provider,
  };
}

/**
 * Great-circle distance in km — lets $near responses carry the same
 * distanceKm field the $geoNear feed produces (Mongo's $near sorts by
 * distance but does not return the value).
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GET /api/listings — public Discover feed with optional filters.
 * Mirrors the compound index { status: 1, expiryEstimate: 1 }.
 */
exports.getFeed = async (req, res, next) => {
  try {
    const { category, urgency, search, status, tag, cityId } = req.query;
    const query = { status: status || "available" };

    if (category && CATEGORIES.includes(category)) query.category = category;
    if (urgency && URGENCY_LEVELS.includes(urgency)) {
      query.urgencyLevel = urgency;
    }
    if (search) {
      query.$or = [
        { title: { $regex: String(search).slice(0, 80), $options: "i" } },
      ];
    }
    if (tag && ALLOWED_TAGS.includes(tag)) {
      query.tags = tag;
    }

    // City filter via $geoNear when a known launch city is requested
    const city = CITIES[cityId];
    if (city) {
      const results = await FoodListing.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [city.lng, city.lat] },
            distanceField: "distanceMeters",
            maxDistance: 60000, // generous metro radius
            query,
            spherical: true,
          },
        },
        { $sort: { urgencyRank: 1, expiryEstimate: 1 } },
        { $limit: 60 },
        {
          $lookup: {
            from: "users",
            localField: "provider",
            foreignField: "_id",
            as: "provider",
          },
        },
        { $unwind: { path: "$provider", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            urgencyRank: {
              $switch: {
                branches: [
                  { case: { $eq: ["$urgencyLevel", "urgent"] }, then: 0 },
                  {
                    case: { $eq: ["$urgencyLevel", "expiring_soon"] },
                    then: 1,
                  },
                ],
                default: 2,
              },
            },
          },
        },
        {
          $project: {
            title: 1,
            category: 1,
            quantity: 1,
            unit: 1,
            weightKg: 1,
            tags: 1,
            rating: 1,
            reviewCount: 1,
            imageUrl: 1,
            urgencyLevel: 1,
            status: 1,
            pickupWindow: 1,
            expiryEstimate: 1,
            location: 1,
            createdAt: 1,
            providerName: { $ifNull: ["$provider.name", "Local provider"] },
            distanceKm: {
              $round: [{ $divide: ["$distanceMeters", 1000] }, 1],
            },
          },
        },
      ]);
      return res.json({ listings: results });
    }

    // Sorting: urgent first, then soonest expiry — matches the index
    const sort =
      urgency === "urgent" || urgency === "expiring_soon"
        ? { expiryEstimate: 1 }
        : { urgencyLevel: 1, expiryEstimate: 1 };

    const listings = await FoodListing.find(query)
      .sort(sort)
      .limit(60)
      .populate("provider", "name organizationType")
      .lean();

    return res.json({ listings: listings.map(withProviderName) });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/listings/nearby?lat=&lng=&maxDistance= — geo discovery.
 *
 * Uses MongoDB's `$near` operator on the 2dsphere index: results come back
 * sorted nearest-first automatically (never re-sort them in app code — a
 * .sort() would discard Mongo's distance ordering).
 *
 *   lat / lng      required, decimal degrees
 *   maxDistance    optional, METERS, default 5000
 *
 * Strictly filters status: "available". /near is a legacy alias that also
 * accepts maxKm (kilometres).
 */
exports.getNearbyListings = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res
        .status(400)
        .json({ message: "lat and lng query params are required" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ message: "Coordinates out of range" });
    }

    let maxDistance = Number(req.query.maxDistance);
    if (!Number.isFinite(maxDistance) && req.query.maxKm) {
      maxDistance = Number(req.query.maxKm) * 1000;
    }
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) maxDistance = 5000;
    maxDistance = Math.min(maxDistance, 100_000); // 100 km ceiling

    const listings = await FoodListing.find({
      status: "available",
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: maxDistance,
        },
      },
    })
      .limit(60)
      .populate("provider", "name organizationType")
      .lean();

    return res.json({
      listings: listings.map((l) => ({
        ...withProviderName(l),
        distanceKm:
          Math.round(
            haversineKm(lat, lng, l.location?.coordinates?.[1] || 0, l.location?.coordinates?.[0] || 0) * 10
          ) / 10,
      })),
      maxDistanceMeters: maxDistance,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/listings/provider — the authenticated provider's listings with
 * live claim info. Returns ACTIVE listings (available + reserved) by default;
 * /mine (legacy alias) passes ?scope=all to include completed/cancelled.
 */
exports.getProviderListings = async (req, res, next) => {
  try {
    const Claim = require("../models/Claim");
    const query = { provider: req.user._id };
    if (req.query.scope !== "all") {
      query.status = { $in: ["available", "reserved"] };
    }
    const listings = await FoodListing.find(query)
      .sort({ createdAt: -1 })
      .lean();
    const claims = await Claim.find({
      foodListing: { $in: listings.map((l) => l._id) },
      status: "reserved",
    })
      .populate("recipient", "name")
      .lean();
    const byListing = {};
    for (const c of claims) {
      byListing[String(c.foodListing)] = byListing[String(c.foodListing)] || [];
      byListing[String(c.foodListing)].push({
        recipientName: c.recipient?.name || "Recipient",
        pickupCode: c.pickupCode,
        claimedAt: c.claimedAt,
      });
    }
    return res.json({
      listings: listings.map((l) => ({
        ...l,
        activeClaims: byListing[String(l._id)] || [],
      })),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/listings — providers publish surplus food.
 */
exports.createListing = async (req, res, next) => {
  try {
    const {
      title,
      category,
      quantity,
      unit,
      imageUrl,
      pickupWindow,
      pickupAddress,
      expiryEstimate,
      urgencyLevel,
      location,
      tags,
      weightKg,
    } = req.body || {};

    if (imageUrl && String(imageUrl).length > MAX_IMAGE_CHARS) {
      return res
        .status(413)
        .json({ message: "Photo too large — please pick a smaller image" });
    }
    if (tags && !Array.isArray(tags)) {
      return res.status(400).json({ message: "tags must be an array" });
    }
    if (tags?.some((tg) => !ALLOWED_TAGS.includes(tg))) {
      return res
        .status(400)
        .json({ message: `tags must be from: ${ALLOWED_TAGS.join(", ")}` });
    }
    if (!CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ message: `category must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (urgencyLevel && !URGENCY_LEVELS.includes(urgencyLevel)) {
      return res.status(400).json({
        message: `urgencyLevel must be one of: ${URGENCY_LEVELS.join(", ")}`,
      });
    }
    if (!pickupWindow?.start || !pickupWindow?.end) {
      return res
        .status(400)
        .json({ message: "pickupWindow.start and pickupWindow.end are required" });
    }
    if (new Date(pickupWindow.end) <= new Date(pickupWindow.start)) {
      return res
        .status(400)
        .json({ message: "pickupWindow.end must be after pickupWindow.start" });
    }

    const listing = await FoodListing.create({
      provider: req.user._id,
      title,
      category,
      quantity: Number(quantity) || 1,
      unit,
      imageUrl,
      pickupWindow,
      pickupAddress: String(pickupAddress || "").slice(0, 200),
      expiryEstimate,
      urgencyLevel,
      location,
      tags: Array.isArray(tags) ? tags : [],
      weightKg: Number(weightKg) || 0,
    });

    // Global feed refresh for every open Discover view…
    emit("listings:update", {
      type: "new",
      listingId: String(listing._id),
      title: listing.title,
    });

    // …plus targeted `listing:created` to nearby recipients' private rooms.
    notifyNearbyRecipients(listing).catch(() => {});

    return res.status(201).json({ listing });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: Object.values(err.errors)[0].message });
    }
    return next(err);
  }
};

/**
 * DELETE /api/listings/:id — soft-cancel own listing (provider or admin).
 */
exports.cancelListing = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid listing id" });
    }
    const listing = await FoodListing.findOne({
      _id: id,
      provider: req.user._id,
    });
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }
    listing.status = "cancelled";
    await listing.save();
    return res.json({ listing });
  } catch (err) {
    return next(err);
  }
};
