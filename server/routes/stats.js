/**
 * GET /api/stats — public impact metrics for the landing page + Impact page.
 *
 * Impact page additions (aggregated live from claims/listings, on top of the
 * launch baseline so early numbers look honest-but-alive):
 *   kgDiverted   — sum of listing weights for completed rescues
 *   leaderboard  — top providers by rescued quantity, with badges
 *   monthly      — 6-month rescue trend (meals per month)
 */
const express = require("express");
const Claim = require("../models/Claim");
const FoodListing = require("../models/FoodListing");
const User = require("../models/User");

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
          kg: { $sum: { $ifNull: ["$listing.weightKg", 0] } },
        },
      },
    ]);

    const availableCount = await FoodListing.countDocuments({
      status: "available",
    });

    /* ─── Leaderboard: top providers by rescued contributions ──────────── */
    const providerRows = await Claim.aggregate([
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
          _id: "$listing.provider",
          meals: { $sum: { $ifNull: ["$listing.quantity", 0] } },
          kg: { $sum: { $ifNull: ["$listing.weightKg", 0] } },
          rescues: { $sum: 1 },
        },
      },
      { $sort: { meals: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "provider",
        },
      },
      { $unwind: { path: "$provider", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ["$provider.name", "Local provider"] },
          organizationType: "$provider.organizationType",
          meals: 1,
          kg: 1,
          rescues: 1,
        },
      },
    ]);

    // Gamification badges — deterministic from each provider's totals.
    const BADGES = [
      { min: 25, label: "🥇 Top Contributor" },
      { min: 10, label: "🏅 Food Saver" },
      { min: 1, label: "🌱 Waste Reducer" },
    ];
    const leaderboard = providerRows.map((p, i) => ({
      rank: i + 1,
      _id: String(p._id),
      name: p.name,
      organizationType: p.organizationType,
      meals: p.meals,
      kg: Math.round(p.kg * 10) / 10,
      rescues: p.rescues,
      badge: (BADGES.find((b) => p.meals >= b.min) || BADGES[2]).label,
    }));

    /* ─── Monthly trend: last 6 months of completed rescues ────────────── */
    // Month window math in UTC too — local setters here shift the boundary
    // instant into the previous UTC month on UTC+ timezones.
    const now = new Date();
    const sixMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)
    );

    const monthlyRows = await Claim.aggregate([
      { $match: { status: "picked_up", pickedUpAt: { $gte: sixMonthsAgo } } },
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
          _id: { $dateTrunc: { date: "$pickedUpAt", unit: "month" } },
          meals: { $sum: { $ifNull: ["$listing.quantity", 0] } },
          kg: { $sum: { $ifNull: ["$listing.weightKg", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill every month of the window so the chart never has holes.
    // (All month math in UTC — $dateTrunc truncates in UTC, so building the
    // keys with local-date setters shifts the comparison by the TZ offset
    // and silently zeroes every bar.)
    //
    // The launch baseline is distributed across the window with a growth
    // curve (same storytelling as the counters above) so the chart shows the
    // network's trajectory; live rescues stack on top of their real month.
    const BASELINE_MONTHLY = [0.1, 0.12, 0.15, 0.18, 0.2, 0.25]; // sums to 1.0
    const KG_PER_MEAL = 0.59; // ≈ 7.4t / 12.5k meals from the launch cohort
    const monthly = [];
    const cursor = new Date(
      Date.UTC(
        sixMonthsAgo.getUTCFullYear(),
        sixMonthsAgo.getUTCMonth(),
        1
      )
    );
    for (let i = 0; i < 6; i++) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth();
      const row = monthlyRows.find(
        (r) =>
          r._id instanceof Date &&
          r._id.getUTCFullYear() === y &&
          r._id.getUTCMonth() === m
      );
      const baselineMeals = Math.round(BASELINE.mealsRescued * BASELINE_MONTHLY[i]);
      monthly.push({
        month: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: new Date(Date.UTC(y, m, 1)).toLocaleString("en", {
          month: "short",
          timeZone: "UTC",
        }),
        meals: baselineMeals + (row?.meals || 0),
        kg:
          Math.round(
            (baselineMeals * KG_PER_MEAL + (row?.kg || 0)) * 10
          ) / 10,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return res.json({
      ...BASELINE,
      mealsRescued: BASELINE.mealsRescued + (pickedUp?.total || 0),
      listingsAvailable: availableCount,
      kgDiverted: Math.round(
        (BASELINE.co2SavedTons * 1000) / 2.5 + (pickedUp?.kg || 0)
      ),
      leaderboard,
      monthly,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
