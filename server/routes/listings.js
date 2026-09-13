/**
 * /api/listings — discover surplus food, publish, manage.
 * The Discover feed mirrors the compound indexes on FoodListing:
 *   { status: 1, expiryEstimate: 1 }  → available, soonest expiry first
 */
const express = require("express");
const mongoose = require("mongoose");
const FoodListing = require("../models/FoodListing");
const { protect, authorize } = require("../middleware/auth");
const { emit } = require("../realtime");

const router = express.Router();

const CATEGORIES = [
  "Prepared Food",
  "Bakery",
  "Produce",
  "Dairy",
  "Packaged Goods",
];
const URGENCY_LEVELS = ["normal", "expiring_soon", "urgent"];
const CATEGORIES_OF_LISTING = CATEGORIES; // alias for the feed filter check
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

// Launch cities for the international city filter (idea 15) — keep in
// sync with client/src/lib/geo.js
const CITIES = {
  london: { lat: 51.5074, lng: -0.1278 },
  nyc: { lat: 40.7128, lng: -74.006 },
  karachi: { lat: 24.8607, lng: 67.0011 },
  dubai: { lat: 25.2048, lng: 55.2708 },
};

// GET /api/listings — public feed with optional filters
router.get("/", async (req, res, next) => {
  try {
    const { category, urgency, search, status, tag, cityId } = req.query;
    const query = { status: status || "available" };

    if (category && CATEGORIES_OF_LISTING.includes(category)) query.category = category;
    if (urgency && URGENCY_LEVELS.includes(urgency)) {
      query.urgencyLevel = urgency;
    }
    if (search) {
      query.$or = [
        { title: { $regex: String(search).slice(0, 80), $options: "i" } },
      ];
    }
    // idea 2 — filter by dietary/safety tag
    if (tag && ALLOWED_TAGS.includes(tag)) {
      query.tags = tag;
    }

    // idea 15 — city filter via $geoNear when a known city is requested
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
        {
          $sort: {
            urgencyRank: 1,
            expiryEstimate: 1,
          },
        },
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
                { case: { $eq: ["$urgencyLevel", "expiring_soon"] }, then: 1 },
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
            distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 1] },
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

    return res.json({
      listings: listings.map((l) => ({
        ...l,
        providerName: l.provider?.name || "Local provider",
        provider: l.provider?._id || l.provider,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/listings/near?lat=..&lng=..&maxKm=.. — geo discovery ($geoNear)
router.get("/near", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const maxKm = Number(req.query.maxKm) || 10;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res
        .status(400)
        .json({ message: "lat and lng query params are required" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ message: "Coordinates out of range" });
    }
    const listings = await FoodListing.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          maxDistance: maxKm * 1000,
          query: { status: "available" },
          spherical: true,
        },
      },
      { $sort: { distanceMeters: 1 } },
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
        $project: {
          title: 1,
          category: 1,
          quantity: 1,
          unit: 1,
          urgencyLevel: 1,
          status: 1,
          pickupWindow: 1,
          expiryEstimate: 1,
          location: 1,
          createdAt: 1,
          providerName: { $ifNull: ["$provider.name", "Local provider"] },
          distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 1] },
        },
      },
    ]);
    return res.json({ listings });
  } catch (err) {
    return next(err);
  }
});

// POST /api/listings — providers publish surplus (also allow recipients to
// become providers implicitly? No — keep roles strict but friendly.)
router.post("/", protect, authorize("provider", "admin"), async (req, res, next) => {
  try {
    const {
      title,
      category,
      quantity,
      unit,
      imageUrl,
      pickupWindow,
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
      return res.status(400).json({ message: `category must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (urgencyLevel && !URGENCY_LEVELS.includes(urgencyLevel)) {
      return res
        .status(400)
        .json({ message: `urgencyLevel must be one of: ${URGENCY_LEVELS.join(", ")}` });
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
      expiryEstimate,
      urgencyLevel,
      location,
      tags: Array.isArray(tags) ? tags : [],
      weightKg: Number(weightKg) || 0,
    });

    // idea 6 — instant push to every open Discover feed
    emit("listings:update", {
      type: "new",
      listingId: String(listing._id),
      title: listing.title,
    });

    return res.status(201).json({ listing });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: Object.values(err.errors)[0].message });
    }
    return next(err);
  }
});

// GET /api/listings/mine — the provider's own listings with live claim counts
router.get("/mine", protect, authorize("provider", "admin"), async (req, res, next) => {
  try {
    const Claim = require("../models/Claim");
    const listings = await FoodListing.find({ provider: req.user._id })
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
});

// DELETE /api/listings/:id — soft-cancel own listing (provider or admin)
router.delete("/:id", protect, authorize("provider", "admin"), async (req, res, next) => {
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
});

module.exports = router;
