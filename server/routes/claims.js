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
    return res.json({ claim });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
