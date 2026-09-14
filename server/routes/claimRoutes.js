/**
 * Claim routes — thin wiring over claimController.
 *
 *   POST   /api/claims              reserve a listing (recipient; atomic)
 *   GET    /api/claims/my           current user's claims with pickup codes
 *   PATCH  /api/claims/:id/pickup   provider confirms code → picked_up + completed
 *   PATCH  /api/claims/:id/received recipient self-confirms a completed pickup
 *   PATCH  /api/claims/:id/cancel   recipient releases a reservation
 *   POST   /api/claims/:id/review   rate a completed pickup (1–5 stars)
 */
const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/claimController");

const router = express.Router();

// Literal paths MUST come before "/:id" or Express swallows them as an id
router.post("/", protect, authorize("recipient", "admin"), ctrl.reserveClaim);
router.get("/my", protect, ctrl.getMyClaims);
router.post("/:id/review", protect, ctrl.reviewClaim);
router.patch("/:id/pickup", protect, ctrl.confirmPickup);
router.patch("/:id/received", protect, ctrl.confirmReceived);
router.patch("/:id/cancel", protect, ctrl.cancelClaim);

module.exports = router;
