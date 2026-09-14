/**
 * Listing routes — thin wiring over listingController.
 *
 *   GET    /api/listings            public Discover feed (filters)
 *   GET    /api/listings/nearby     $near geo search (lat, lng, maxDistance meters)
 *   GET    /api/listings/provider   authenticated provider's active listings
 *   POST   /api/listings            publish surplus (provider/admin)
 *   DELETE /api/listings/:id        soft-cancel own listing (provider/admin)
 *
 * /near and /mine are kept as legacy aliases (/near accepts maxKm; /mine
 * passes ?scope=all so it keeps returning completed listings like before).
 */
const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/listingController");

const router = express.Router();

// Public geo discovery — must be declared before any "/:id"-style routes
router.get("/nearby", ctrl.getNearbyListings);
router.get("/near", ctrl.getNearbyListings); // legacy alias (maxKm supported)

// Public Discover feed
router.get("/", ctrl.getFeed);

// Provider's own listings
router.get("/provider", protect, authorize("provider", "admin"), ctrl.getProviderListings);
router.get(
  "/mine",
  protect,
  authorize("provider", "admin"),
  (req, res, next) => {
    req.query.scope = "all"; // legacy behaviour: include completed/cancelled
    return next();
  },
  ctrl.getProviderListings
);

// Publish + manage (provider/admin)
router.post("/", protect, authorize("provider", "admin"), ctrl.createListing);
router.delete("/:id", protect, authorize("provider", "admin"), ctrl.cancelListing);

module.exports = router;
