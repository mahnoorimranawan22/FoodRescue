import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useToast } from "./Toast";
import { useSettings } from "../context/SettingsContext";
import { haversineKm } from "../lib/geo";
import { formatDistance } from "../lib/format";

const STATUS_STYLES = {
  reserved: "bg-warm-orange-500/15 text-warm-orange-600 ring-warm-orange-500/40",
  picked_up: "bg-forest-500/10 text-forest-600 ring-forest-500/30",
  cancelled: "bg-red-100 text-red-700 ring-red-300/60",
};

/**
 * "My Claims" — reservations with pickup codes (idea 9: post-pickup star
 * reviews) and idea 18: a nearest-first pickup route planner that batches
 * today's collections into one efficient loop.
 */
export default function MyClaimsPanel({ refreshKey = 0 }) {
  const toast = useToast();
  const { t, units } = useSettings();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState({});
  const [routeOpen, setRouteOpen] = useState(false);
  const [listingCoords, setListingCoords] = useState({});
  const [reviewFor, setReviewFor] = useState(null); // claim id being reviewed
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewText, setReviewText] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.getMyClaims(), api.getListings({})])
      .then(([claimsData, listingsData]) => {
        if (!active) return;
        setClaims(claimsData.claims || []);
        const coords = {};
        for (const l of listingsData.listings || []) {
          if (l.location?.coordinates) coords[l._id] = l.location.coordinates;
        }
        setListingCoords(coords);
      })
      .catch((err) => {
        if (active) toast(err.message || "Could not load claims", "error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const confirm = async (claimId) => {
    try {
      const { claim } = await api.confirmPickup(claimId, codes[claimId] || "");
      toast(t("pickupConfirmed"), "success");
      setClaims((list) =>
        list.map((c) => (c._id === claimId ? { ...c, ...claim } : c))
      );
      setReviewFor(claimId); // prompt for a rating right after handover
    } catch (err) {
      toast(err.message || "Could not confirm pickup", "error");
    }
  };

  const submitReview = async (claimId) => {
    try {
      await api.reviewClaim(claimId, reviewStars, reviewText.trim());
      toast(t("reviewThanks"), "success");
      setClaims((list) =>
        list.map((c) =>
          c._id === claimId
            ? { ...c, rating: reviewStars, review: reviewText.trim() }
            : c
        )
      );
      setReviewFor(null);
      setReviewText("");
    } catch (err) {
      toast(err.message || "Could not save the rating", "error");
    }
  };

  /* idea 18 — nearest-first route from the first reserved claim (greedy).
     In a real deployment the viewer's GPS position would be the origin. */
  const route = useMemo(() => {
    const pending = claims.filter((c) => c.status === "reserved");
    if (pending.length < 2) return null;
    const points = pending
      .map((c) => ({ claim: c, coords: listingCoords[c.foodListing] }))
      .filter((p) => p.coords);
    if (points.length < 2) return null;

    const remaining = [...points];
    const ordered = [remaining.shift()];
    let totalKm = 0;
    while (remaining.length > 0) {
      const last = ordered[ordered.length - 1];
      let bestIdx = 0;
      let bestDist = Infinity;
      remaining.forEach((p, i) => {
        const d = haversineKm(
          [last.coords[1], last.coords[0]],
          [p.coords[1], p.coords[0]]
        );
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      totalKm += bestDist;
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    return { ordered, totalKm };
  }, [claims, listingCoords]);

  if (loading) {
    return (
      <p className="animate-pulse-soft py-6 text-center text-sm font-semibold text-forest-600/70">
        Loading your reservations…
      </p>
    );
  }

  if (claims.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-forest-600/70 dark:text-cream-100/60">
        {t("noClaims")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* idea 18 — pickup route planner */}
      {route && (
        <div className="rounded-2xl border border-forest-500/25 bg-forest-500/5 p-4 dark:border-forest-500/40">
          <button
            type="button"
            onClick={() => setRouteOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-extrabold text-forest-700 dark:text-cream-50">
              🚚 Pickup route — {route.ordered.length} stops ·{" "}
              {formatDistance(route.totalKm, units)} total
            </span>
            <span className="text-forest-600">{routeOpen ? "▾" : "▸"}</span>
          </button>
          {routeOpen && (
            <ol className="animate-fade-in mt-3 space-y-2">
              {route.ordered.map(({ claim }, i) => (
                <li
                  key={claim._id}
                  className="flex items-center gap-3 text-sm text-forest-700/85 dark:text-cream-100/80"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-500 text-xs font-extrabold text-white">
                    {i + 1}
                  </span>
                  <span className="truncate">{claim.listingTitle}</span>
                  <span className="ml-auto font-mono text-xs font-bold text-warm-orange-600">
                    {claim.pickupCode}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <ul className="space-y-3">
        {claims.map((claim) => (
          <li
            key={claim._id}
            className="rounded-2xl border border-cream-200 bg-white/70 p-4 dark:border-white/10 dark:bg-night-50/60"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-bold text-forest-700 dark:text-cream-50">
                  {claim.listingTitle || "Surplus listing"}
                </p>
                <p className="mt-0.5 text-xs text-forest-600/70 dark:text-cream-100/60">
                  {claim.providerName || "Local provider"} ·{" "}
                  {new Date(claim.claimedAt).toLocaleDateString()}
                </p>
                <span
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
                    STATUS_STYLES[claim.status] || STATUS_STYLES.reserved
                  }`}
                >
                  {claim.status === "picked_up"
                    ? "✓ picked up"
                    : claim.status === "cancelled"
                      ? "cancelled"
                      : `code ${claim.pickupCode}`}
                </span>
              </div>

              {claim.status === "reserved" && (
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0000"
                    aria-label={`Pickup code for ${claim.listingTitle || "claim"}`}
                    value={codes[claim._id] || ""}
                    onChange={(e) =>
                      setCodes((c) => ({
                        ...c,
                        [claim._id]: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    className="w-24 rounded-xl border border-cream-200 bg-white px-3 py-2 text-center font-heading text-lg font-bold tracking-[0.3em] text-forest-700 placeholder:tracking-normal placeholder:text-forest-600/30 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30 dark:border-white/10 dark:bg-night-100 dark:text-cream-50"
                  />
                  <button
                    type="button"
                    onClick={() => confirm(claim._id)}
                    className="rounded-full bg-forest-500 px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2"
                  >
                    {t("confirmPickup")}
                  </button>
                </div>
              )}
            </div>

            {/* idea 9 — post-pickup review */}
            {claim.status === "picked_up" && !claim.rating && (
              <div className="mt-3 border-t border-cream-200 pt-3 dark:border-white/10">
                <p className="text-xs font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
                  {t("ratePickup")}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewStars(star)}
                      aria-label={`${star} star${star > 1 ? "s" : ""}`}
                      className={`text-xl transition-transform hover:scale-125 ${
                        star <= (reviewFor === claim._id ? reviewStars : 5)
                          ? "text-warm-orange-500"
                          : "text-cream-200 dark:text-white/20"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {reviewFor === claim._id && (
                  <div className="animate-fade-in mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      placeholder={t("reviewPlaceholder")}
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      className="flex-1 rounded-xl border border-cream-200 bg-white px-3 py-2 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30 dark:border-white/10 dark:bg-night-100 dark:text-cream-50"
                    />
                    <button
                      type="button"
                      onClick={() => submitReview(claim._id)}
                      className="rounded-full bg-warm-orange-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-warm-orange-600"
                    >
                      ★ Send
                    </button>
                  </div>
                )}
                {reviewFor !== claim._id && (
                  <button
                    type="button"
                    onClick={() => setReviewFor(claim._id)}
                    className="mt-2 text-xs font-bold text-warm-orange-600 hover:underline"
                  >
                    ★ Leave a rating
                  </button>
                )}
              </div>
            )}
            {claim.rating > 0 && (
              <p className="mt-2 text-xs font-semibold text-forest-600/70 dark:text-cream-100/60">
                Your rating:{" "}
                <span className="text-warm-orange-500">
                  {"★".repeat(claim.rating)}
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
