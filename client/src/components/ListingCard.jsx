import { useEffect, useState } from "react";
import api from "../lib/api";
import { useToast } from "./Toast";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { CATEGORY_IMAGES } from "../lib/images";
import { formatDistance, formatTime, timeLeftLabel } from "../lib/format";

const CATEGORY_EMOJI = {
  "Prepared Food": "🍲",
  Bakery: "🥖",
  Produce: "🥕",
  Dairy: "🧀",
  "Packaged Goods": "🥫",
};

const TAG_STYLES = {
  vegetarian: "bg-forest-500/10 text-forest-600 ring-forest-500/25",
  vegan: "bg-emerald-100 text-emerald-700 ring-emerald-300/60",
  halal: "bg-teal-100 text-teal-700 ring-teal-300/60",
  kosher: "bg-sky-100 text-sky-700 ring-sky-300/60",
  "gluten-free": "bg-amber-100 text-amber-700 ring-amber-300/60",
  "keep refrigerated": "bg-sky-500/10 text-sky-700 ring-sky-400/40",
};

const URGENCY_STYLES = {
  urgent: "bg-red-100 text-red-700 ring-red-300/60 animate-pulse-soft",
  expiring_soon: "bg-warm-orange-500/15 text-warm-orange-600 ring-warm-orange-500/40",
  normal: "bg-forest-500/10 text-forest-600 ring-forest-500/30",
};

/** Stars display for a provider rating: ★★★★★ with halves collapsed down. */
function Stars({ rating, count }) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold text-forest-600/85"
      title={`${rating} / 5 from ${count || 0} reviews`}
    >
      <span aria-hidden="true" className="tracking-tight text-warm-orange-500">
        {"★".repeat(full)}
        {half ? "⯨" : ""}
      </span>
      <span>{Number(rating).toFixed(1)}</span>
      {count != null && <span className="text-forest-600/50">({count})</span>}
    </span>
  );
}

export default function ListingCard({ listing, index = 0, onClaimed }) {
  const toast = useToast();
  const { user } = useAuth();
  const { t, tz, units } = useSettings();
  const [status, setStatus] = useState(listing.status);
  const [claiming, setClaiming] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Live countdown (idea 5): re-render every 30s while mounted
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const closing = new Date(listing.pickupWindow?.end).getTime() - now;
  const countdownCls =
    listing.urgencyLevel === "urgent" || closing < 36e5
      ? "text-warm-orange-600"
      : "text-forest-600/80";

  // Per-listing photo → category default photo → emoji gradient fallback
  const photoSrc =
    !imgFailed && (listing.imageUrl || CATEGORY_IMAGES[listing.category]);

  const handleClaim = async () => {
    if (!user) {
      toast(t("loginToClaim"), "info");
      return;
    }
    setClaiming(true);
    try {
      const { claim } = await api.createClaim(listing._id);
      setStatus("reserved");
      toast(t("reservedToast", { code: claim.pickupCode }), "success");
      onClaimed?.(claim);
    } catch (err) {
      toast(err.message || "Could not claim this listing", "error");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <article
      className="group glass-panel flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-forest-glow"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Visual header — food photo with graceful emoji fallback */}
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-forest-500/15 via-cream-100 to-warm-orange-500/15 dark:bg-night-100">
        {photoSrc ? (
          <>
            <img
              src={photoSrc}
              alt={listing.title}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            />
            {/* Legibility gradient + brand tint */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-forest-700/45 via-transparent to-forest-700/10"
            />
          </>
        ) : (
          <span
            aria-hidden="true"
            className="text-6xl transition-transform duration-500 group-hover:scale-125 group-hover:-rotate-6"
          >
            {CATEGORY_EMOJI[listing.category] || "🍽️"}
          </span>
        )}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${
            URGENCY_STYLES[listing.urgencyLevel] || URGENCY_STYLES.normal
          }`}
        >
          {listing.urgencyLevel === "expiring_soon"
            ? t("urgencySoon")
            : listing.urgencyLevel === "urgent"
              ? t("urgencyUrgent")
              : t("urgencyNormal")}
        </span>
        {listing.distanceKm != null && (
          <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold text-forest-600 backdrop-blur-sm dark:bg-night-50/85 dark:text-cream-50">
            📍 {formatDistance(listing.distanceKm, units)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg font-bold leading-snug text-forest-700 transition-colors group-hover:text-warm-orange-600 dark:text-cream-50">
            {listing.title}
          </h3>
          {listing.rating > 0 && (
            <Stars rating={listing.rating} count={listing.reviewCount} />
          )}
        </div>
        <p className="mt-1 text-sm text-forest-600/75 dark:text-cream-100/70">
          {listing.providerName || "Local provider"} ·{" "}
          {listing.quantity} {listing.unit || "portions"}
        </p>

        {/* Dietary & safety tags (idea 2) */}
        {listing.tags?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {listing.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                  TAG_STYLES[tag] ||
                  "bg-cream-100 text-forest-600 ring-cream-200 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Live countdown + timezone-correct pickup window */}
        <div
          className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold ${countdownCls}`}
        >
          <span
            className={
              closing < 36e5 && closing > 0 ? "animate-pulse-soft" : undefined
            }
          >
            ⏰ {timeLeftLabel(listing.pickupWindow?.end, now)}
          </span>
          <span>
            🕒 {t("pickup")} {formatTime(listing.pickupWindow?.start, tz)}–
            {formatTime(listing.pickupWindow?.end, tz)}
          </span>
        </div>

        <div className="mt-5 flex-1" />
        {status === "available" ? (
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming}
            className="w-full rounded-full bg-warm-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 focus-visible:ring-offset-2"
          >
            {claiming ? t("claiming") : t("claim")}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-full bg-forest-500/10 px-5 py-2.5 text-sm font-bold text-forest-600 dark:bg-forest-500/20 dark:text-cream-100/80">
            <span className="inline-block h-2 w-2 animate-pulse-soft rounded-full bg-forest-500" />
            {status === "reserved" ? t("reserved") : t("gone")}
          </div>
        )}
      </div>
    </article>
  );
}
