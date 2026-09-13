/**
 * /api/claims — reservation lifecycle.
 * reserve → (recipient) show pickup code → (provider) confirm via code.
 * Double-booking is impossible thanks to the partial unique index on
 * { foodListing: 1 } filtered to status: "reserved".
 */
const express = require("express");
const mongoose = require("mongoose");
const FoodListing = require("../models/FoodListing");
const Claim = require("../models/Claim");
const { protect } = require("../middleware/auth");
const { emit } = require("../realtime");

const router = express.Router();

/**
 * POST /api/claims — reserve a listing (recipients only).
 * Body: { foodListing }
 * The reservation + status flip are validated by the DB-level unique index:
 * two concurrent claims cannot both hold status "reserved" for one listing.
 */
router.post("/", protect, async (req, res, next) => {
  try {
    const { foodListing } = req.body || {};
    if (!foodListing || !mongoose.isValidObjectId(foodListing)) {
      return res.status(400).json({ message: "foodListing id is required" });
    }

    const listing = await FoodListing.findById(foodListing);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }
    if (listing.status !== "available") {
      return res
        .status(409)
        .json({ message: "This listing is no longer available" });
    }
    if (String(listing.provider) === String(req.user._id)) {
      return res
        .status(403)
        .json({ message: "You cannot claim your own listing" });
    }

    const claim = await Claim.create({
      recipient: req.user._id,
      foodListing: listing._id,
      provider: listing.provider,
    });

    listing.status = "reserved";
    await listing.save();

    // idea 6 — push the update to every connected client instantly
    emit("listings:update", {
      type: "claimed",
      listingId: String(listing._id),
      status: listing.status,
    });

    const populated = await Claim.findById(claim._id)
      .populate("foodListing", "title")
      .lean();

    return res.status(201).json({
      claim: {
        _id: claim._id,
        foodListing: listing._id,
        listingTitle: populated?.foodListing?.title || listing.title,
        providerName: "Local provider",
        status: claim.status,
        pickupCode: claim.pickupCode,
        claimedAt: claim.claimedAt,
      },
    });
  } catch (err) {
    // E11000 on the partial unique index = someone else reserved first
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "Someone just claimed this listing — try another!" });
    }
    return next(err);
  }
});

/**
 * POST /api/claims/:id/review — rate a completed pickup (idea 9).
 * Updates the listing's rolling provider rating.
 */
router.post("/:id/review", protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body || {};
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ message: "rating must be 1–5" });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid claim id" });
    }
    const claim = await Claim.findOne({ _id: id, recipient: req.user._id });
    if (!claim) return res.status(404).json({ message: "Claim not found" });
    if (claim.status !== "picked_up") {
      return res
        .status(409)
        .json({ message: "Only completed pickups can be rated" });
    }
    claim.rating = stars;
    claim.review = String(comment || "").slice(0, 500);
    claim.reviewedAt = new Date();
    await claim.save();

    // Rolling average onto the listing (provider's public rating)
    const listing = await FoodListing.findById(claim.foodListing);
    if (listing) {
      const count = (listing.reviewCount || 0) + 1;
      const avg = ((listing.rating || 0) * (count - 1) + stars) / count;
      listing.reviewCount = count;
      listing.rating = Math.round(avg * 10) / 10;
      await listing.save();
    }
    return res.json({ claim });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/claims/my — the current user's claims (with pickup codes).
 */
router.get("/my", protect, async (req, res, next) => {
  try {
    const claims = await Claim.find({ recipient: req.user._id })
      .sort({ claimedAt: -1 })
      .populate("foodListing", "title")
      .populate("provider", "name")
      .lean();
    return res.json({
      claims: claims.map((c) => ({
        _id: c._id,
        foodListing: c.foodListing?._id || c.foodListing,
        listingTitle: c.foodListing?.title || "Surplus listing",
        providerName: c.provider?.name || "Local provider",
        status: c.status,
        pickupCode: c.pickupCode,
        claimedAt: c.claimedAt,
        pickedUpAt: c.pickedUpAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/claims/:id/pickup — provider confirms handover with the code.
 * Body: { pickupCode }
 * Flips claim → picked_up and listing → completed in one atomic guard:
 * the update only lands if the code matches AND the claim is still reserved.
 */
router.patch("/:id/pickup", protect, async (req, res, next) => {
  try {
    const { pickupCode } = req.body || {};
    if (!/^\d{4}$/.test(String(pickupCode || ""))) {
      return res.status(400).json({ message: "A 4-digit pickup code is required" });
    }
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid claim id" });
    }

    const claim = await Claim.findOne({
      _id: id,
      provider: req.user._id,
      status: "reserved",
      pickupCode: String(pickupCode),
    });
    if (!claim) {
      return res
        .status(400)
        .json({ message: "Incorrect code or claim not in reserved state" });
    }

    claim.status = "picked_up";
    claim.pickedUpAt = new Date();
    await claim.save();

    await FoodListing.updateOne(
      { _id: claim.foodListing, status: "reserved" },
      { status: "completed" }
    );

    emit("listings:update", {
      type: "completed",
      listingId: String(claim.foodListing),
    });

    return res.json({ claim });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/claims/:id/cancel — recipient cancels their reservation.
 * Frees the listing back to "available" atomically only if it is still reserved.
 */
router.patch("/:id/cancel", protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid claim id" });
    }
    const claim = await Claim.findOne({
      _id: id,
      recipient: req.user._id,
      status: "reserved",
    });
    if (!claim) {
      return res
        .status(404)
        .json({ message: "Reserved claim not found (already picked up or cancelled?)" });
    }
    claim.status = "cancelled";
    await claim.save();
    await FoodListing.updateOne(
      { _id: claim.foodListing, status: "reserved" },
      { status: "available" }
    );

    emit("listings:update", {
      type: "released",
      listingId: String(claim.foodListing),
      status: "available",
    });

    return res.json({ claim });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
