/**
 * GET /api/stats — public impact counters for the landing page.
 * mealsRescued grows from real completed claims on top of a launch baseline.
 */
const express = require("express");
const Claim = require("../models/Claim");
const FoodListing = require("../models/FoodListing");

const router = express.Router();

// Launch baseline (seeded communities) + live DB activity
const BASELINE = {
  mealsRescued: 12480,
  partners: 96,
  cities: 4,
  co2SavedTons: 18.4,
};

router.get("/", async (_req, res, next) => {
  try {
    const [pickedUp] = await Claim.aggregate([
      { $match: { status: "picked_up" } },
      {
        $lookup: {
          from: "foodlistings",
          localField: "foodListing",
          foreignField: "_id",
          as: "listing",
        },
      },
      { $unwind: "$listing" },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$listing.quantity", 0] } },
        },
      },
    ]);

    const [availableCount] = await FoodListing.countDocuments({
      status: "available",
    }).then((n) => [{ count: n }]);

    return res.json({
      ...BASELINE,
      mealsRescued: BASELINE.mealsRescued + (pickedUp?.total || 0),
      listingsAvailable: availableCount?.count ?? 0,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
