/**
 * Claim controllers — the reservation lifecycle.
 *
 *   reserve → (recipient) shows a 4-digit pickup code →
 *   (provider) confirms the code at handover → picked_up + listing completed.
 *
 * Concurrency safety (the interesting part):
 *   • Listing status flips happen ONLY via atomic, guarded findOneAndUpdate
 *     calls — never a read-modify-write `doc.status = ...; doc.save()`, which
 *     races when two recipients tap "Claim" at the same time.
 *   • The Claim model's PARTIAL UNIQUE INDEX on { foodListing: 1 } filtered
 *     to status: "reserved" makes a double reservation impossible at the DB
 *     level even across processes (E11000 → friendly 409).
 *   • The listing guard in reserveClaim is written FIRST and rolled back if
 *     the claim insert fails, so a failed claim never strands a reserved
 *     listing that nobody owns.
 */
const mongoose = require("mongoose");
const FoodListing = require("../models/FoodListing");
const Claim = require("../models/Claim");
const {
  emit,
  notifyProviderOfClaim,
} = require("../services/socket");

/** Shape a claim for the client (mirrors lib/api.js expectations). */
function shapeClaim(claim, listingTitle) {
  return {
    _id: claim._id,
    foodListing: claim.foodListing?._id || claim.foodListing,
    listingTitle: listingTitle || claim.foodListing?.title || "Surplus listing",
    providerName: claim.provider?.name || "Local provider",
    status: claim.status,
    pickupCode: claim.pickupCode,
    claimedAt: claim.claimedAt,
    pickedUpAt: claim.pickedUpAt,
  };
}

/**
 * Shape a claim for the recipient dashboard: everything shapeClaim carries,
 * plus the listing's pickup window, address and map coordinates so the
 * recipient can navigate to the exact handover point.
 */
function shapeClaimDetailed(claim) {
  const l = claim.foodListing;
  return {
    ...shapeClaim(claim, l?.title),
    quantity: l?.quantity,
    unit: l?.unit,
    imageUrl: l?.imageUrl,
    category: l?.category,
    pickupWindow: l?.pickupWindow,
    pickupAddress: l?.pickupAddress,
    location: l?.location,
    distanceKm: l?.distanceKm,
    providerPhone: claim.provider?.phone,
  };
}

/**
 * POST /api/claims — reserve a listing (recipients only).
 * Body: { foodListing: <listing id> }
 */
exports.reserveClaim = async (req, res, next) => {
  try {
    const { foodListing } = req.body || {};
    if (!foodListing || !mongoose.isValidObjectId(foodListing)) {
      return res.status(400).json({ message: "foodListing id is required" });
    }

    // Atomic guard: flip available → reserved in the DB itself. If another
    // recipient won the race, matched = 0 and we return a friendly 409.
    const listing = await FoodListing.findOneAndUpdate(
      { _id: foodListing, status: "available" },
      { $set: { status: "reserved" } },
      { new: true }
    );
    if (!listing) {
      const exists = await FoodListing.exists({ _id: foodListing });
      return res.status(exists ? 409 : 404).json({
        message: exists
          ? "This listing is no longer available"
          : "Listing not found",
      });
    }
    if (String(listing.provider) === String(req.user._id)) {
      // Own listing — undo the reservation before leaving.
      await FoodListing.updateOne(
        { _id: listing._id, status: "reserved" },
        { $set: { status: "available" } }
      );
      return res
        .status(403)
        .json({ message: "You cannot claim your own listing" });
    }

    let claim;
    try {
      claim = await Claim.create({
        recipient: req.user._id,
        foodListing: listing._id,
        provider: listing.provider,
      });
    } catch (err) {
      // Roll the listing back to available, then explain the failure.
      await FoodListing.updateOne(
        { _id: listing._id, status: "reserved" },
        { $set: { status: "available" } }
      );
      if (err.code === 11000) {
        // Lost the unique-index race: someone else reserved first.
        return res
          .status(409)
          .json({ message: "Someone just claimed this listing — try another!" });
      }
      if (err.name === "ValidationError") {
        return res
          .status(400)
          .json({ message: Object.values(err.errors)[0].message });
      }
      return next(err);
    }

    // Push the update to every connected Discover feed instantly…
    emit("listings:update", {
      type: "claimed",
      listingId: String(listing._id),
      status: listing.status,
    });

    // …and ping the provider's private room so they see the reservation
    // (with the pickup code to verify at handover) without a refresh.
    notifyProviderOfClaim({
      providerId: listing.provider,
      listingId: listing._id,
      listingTitle: listing.title,
      recipientName: req.user.name,
      pickupCode: claim.pickupCode,
    });

    const populated = await Claim.findById(claim._id)
      .populate("foodListing", "title")
      .populate("provider", "name")
      .lean();

    return res.status(201).json({
      claim: shapeClaim(populated || claim, listing.title),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/claims/my — the current user's claims (with pickup codes).
 * Detailed shape for recipients: window/address/coordinates for the
 * dashboard's pickup instructions + map.
 */
exports.getMyClaims = async (req, res, next) => {
  try {
    const claims = await Claim.find({ recipient: req.user._id })
      .sort({ claimedAt: -1 })
      .populate(
        "foodListing",
        "title quantity unit imageUrl category pickupWindow pickupAddress location distanceKm"
      )
      .populate("provider", "name phone")
      .lean();
    return res.json({ claims: claims.map(shapeClaimDetailed) });
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/claims/:id/received — RECIPIENT-side self-service confirmation.
 * The canonical flow is provider-confirms-code, but recipients who arrive and
 * collect without a staffed handover can mark their own claim received.
 * Guarded atomically: only flips reserved → picked_up, then completes the
 * listing. Mirrors confirmPickup's two-document consistency.
 */
exports.confirmReceived = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid claim id" });
    }
    const claim = await Claim.findOneAndUpdate(
      { _id: id, recipient: req.user._id, status: "reserved" },
      { $set: { status: "picked_up", pickedUpAt: new Date() } },
      { new: true }
    );
    if (!claim) {
      return res.status(409).json({
        message:
          "Claim is not reserved (already picked up, cancelled, or not yours)",
      });
    }
    const listingUpdate = await FoodListing.updateOne(
      { _id: claim.foodListing, status: "reserved" },
      { $set: { status: "completed" } }
    );
    if (listingUpdate.matched === 0) {
      await Claim.updateOne(
        { _id: claim._id, status: "picked_up" },
        { $set: { status: "reserved", pickedUpAt: null } }
      );
      return res
        .status(409)
        .json({ message: "Listing is no longer reserved — cannot confirm" });
    }

    emit("listings:update", {
      type: "completed",
      listingId: String(claim.foodListing),
    });
    return res.json({ claim });
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/claims/:id/pickup — provider confirms handover with the code.
 * Body: { pickupCode: "1234" }
 *
 * Both documents are updated atomically with state guards:
 *   • the CLAIM only flips reserved → picked_up if the code matches and it is
 *     still reserved (the matched=0 check also makes retries idempotent);
 *   • the LISTING only flips reserved → completed if it is still reserved.
 * If the listing update fails, the claim is rolled back so the code stays
 * usable and the two documents can never disagree.
 */
exports.confirmPickup = async (req, res, next) => {
  try {
    const { pickupCode } = req.body || {};
    if (!/^\d{4}$/.test(String(pickupCode || ""))) {
      return res
        .status(400)
        .json({ message: "A 4-digit pickup code is required" });
    }
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid claim id" });
    }

    const claim = await Claim.findOneAndUpdate(
      {
        _id: id,
        provider: req.user._id,
        status: "reserved",
        pickupCode: String(pickupCode),
      },
      { $set: { status: "picked_up", pickedUpAt: new Date() } },
      { new: true }
    );
    if (!claim) {
      const pending = await Claim.findOne({ _id: id, provider: req.user._id });
      if (pending && pending.status === "picked_up") {
        // Idempotent retry — the pickup was already confirmed.
        return res.json({ claim: pending });
      }
      return res
        .status(400)
        .json({ message: "Incorrect code or claim not in reserved state" });
    }

    const listingUpdate = await FoodListing.updateOne(
      { _id: claim.foodListing, status: "reserved" },
      { $set: { status: "completed" } }
    );
    if (listingUpdate.matched === 0) {
      // Compensate: keep the claim reservable so state can't diverge.
      await Claim.updateOne(
        { _id: claim._id, status: "picked_up" },
        { $set: { status: "reserved", pickedUpAt: null } }
      );
      return res.status(409).json({
        message: "Listing is no longer reserved — cannot confirm pickup",
      });
    }

    emit("listings:update", {
      type: "completed",
      listingId: String(claim.foodListing),
    });

    return res.json({ claim });
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/claims/:id/cancel — recipient cancels their reservation.
 * Frees the listing back to "available" atomically only if still reserved.
 */
exports.cancelClaim = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid claim id" });
    }
    const claim = await Claim.findOneAndUpdate(
      { _id: id, recipient: req.user._id, status: "reserved" },
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!claim) {
      return res.status(404).json({
        message: "Reserved claim not found (already picked up or cancelled?)",
      });
    }
    await FoodListing.updateOne(
      { _id: claim.foodListing, status: "reserved" },
      { $set: { status: "available" } }
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
};

/**
 * POST /api/claims/:id/review — rate a completed pickup.
 * Updates the listing's rolling provider rating.
 */
exports.reviewClaim = async (req, res, next) => {
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
};
