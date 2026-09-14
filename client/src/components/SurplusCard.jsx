import { useEffect, useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { CATEGORY_IMAGES } from "../lib/images";
import { formatDistance, timeLeftLabel } from "../lib/format";

const CATEGORY_EMOJI = {
  "Prepared Food": "🍲",
  Bakery: "🥖",
  Produce: "🥕",
  Dairy: "🧀",
  "Packaged Goods": "🥫",
};

/**
 * Dynamic status badge, derived from the listing's urgencyLevel, with a
 * time-based floor: anything under 45 minutes to pickup close is Urgent 🔴,
 * anything under 2 hours is Expiring Soon 🟡, the rest is Available 🟢.
 */
export function statusFor(listing, now = Date.now()) {
  const msLeft = new Date(listing.pickupWindow?.end).getTime() - now;
  if (
    listing.urgencyLevel === "urgent" ||
    (msLeft > 0 && msLeft < 45 * 60 * 1000)
  ) {
    return { key: "urgent", dot: "🔴", cls: "bg-red-100 text-red-700 ring-red-300/60", pulse: true };
  }
  if (
    listing.urgencyLevel === "expiring_soon" ||
    (msLeft > 0 && msLeft < 2 * 36e5)
  ) {
    return { key: "expiring_soon", dot: "🟡", cls: "bg-amber-100 text-amber-800 ring-amber-300/60", pulse: false };
  }
  return { key: "available", dot: "🟢", cls: "bg-forest-500/10 text-forest-600 ring-forest-500/30", pulse: false };
}

export default function SurplusCard({ listing, onRescue }) {
  const { t, tz, units } = useSettings();
  const [now, setNow] = useState(Date.now());
  const [imgFailed, setImgFailed] = useState(false);

  // Keep the countdown + status badge honest
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const status = statusFor(listing, now);
  const photoSrc = !imgFailed && (listing.imageUrl || CATEGORY_IMAGES[listing.category]);
  const closing = new Date(listing.pickupWindow?.end).getTime() - now;

  return (
    <article className="group glass-panel flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-forest-glow">
      {/* Photo header */}
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

        {/* Dynamic status badge */}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${status.cls}`}
        >
          <span aria-hidden="true">{status.dot}</span>{" "}
          {status.key === "urgent"
            ? t("statusUrgent")
            : status.key === "expiring_soon"
              ? t("statusExpiringSoon")
              : t("statusAvailable")}
        </span>

        {/* Distance badge (server geo or client haversine) */}
        {listing.distanceKm != null && (
          <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold text-forest-600 backdrop-blur-sm dark:bg-night-50/85 dark:text-cream-50">
            📍 {t("distanceAway", { d: formatDistance(listing.distanceKm, units) })}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg font-bold leading-snug text-forest-700 transition-colors group-hover:text-warm-orange-600 dark:text-cream-50">
            {listing.title}
          </h3>
        </div>
        <p className="mt-1 text-sm text-forest-600/75 dark:text-cream-100/70">
          {listing.category} · {listing.providerName || "Local provider"} ·{" "}
          {listing.quantity} {listing.unit || "portions"}
        </p>

        {/* Pickup window + live countdown */}
        <div
          className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold ${
            closing < 36e5 && closing > 0
              ? "text-warm-orange-600"
              : "text-forest-600/80"
          }`}
        >
          <span
            className={closing < 36e5 && closing > 0 ? "animate-pulse-soft" : undefined}
          >
            ⏰ {timeLeftLabel(listing.pickupWindow?.end, now)}
          </span>
          <span>
            🕒 {t("pickup")}{" "}
            {new Date(listing.pickupWindow?.start).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: tz || undefined,
            })}
            –
            {new Date(listing.pickupWindow?.end).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: tz || undefined,
            })}
          </span>
        </div>

        <div className="mt-5 flex-1" />
        {listing.status === "available" ? (
          <button
            type="button"
            onClick={() => onRescue?.(listing)}
            className="w-full rounded-full bg-warm-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 focus-visible:ring-offset-2"
          >
            🥡 {t("rescueFood")}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-full bg-forest-500/10 px-5 py-2.5 text-sm font-bold text-forest-600 dark:bg-forest-500/20 dark:text-cream-100/80">
            <span className="inline-block h-2 w-2 animate-pulse-soft rounded-full bg-forest-500" />
            {listing.status === "reserved" ? t("reserved") : t("gone")}
          </div>
        )}
      </div>
    </article>
  );
}
