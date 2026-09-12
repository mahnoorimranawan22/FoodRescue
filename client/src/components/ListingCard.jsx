import { useState } from "react";
import api from "../lib/api";
import { useToast } from "./Toast";
import { useAuth } from "../context/AuthContext";
import { CATEGORY_IMAGES } from "../lib/images";

const CATEGORY_EMOJI = {
  "Prepared Food": "🍲",
  Bakery: "🥖",
  Produce: "🥕",
  Dairy: "🧀",
  "Packaged Goods": "🥫",
};

const URGENCY_STYLES = {
  urgent: "bg-red-100 text-red-700 ring-red-300/60 animate-pulse-soft",
  expiring_soon: "bg-warm-orange-500/15 text-warm-orange-600 ring-warm-orange-500/40",
  normal: "bg-forest-500/10 text-forest-600 ring-forest-500/30",
};

function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  const h = Math.floor(ms / 36e5);
  if (h < 1) return "under an hour left";
  if (h < 24) return `${h}h left`;
  const d = Math.floor(h / 24);
  return `${d}d left`;
}

export default function ListingCard({ listing, index = 0, onClaimed }) {
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState(listing.status);
  const [claiming, setClaiming] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Per-listing photo → category default photo → emoji gradient fallback
  const photoSrc =
    !imgFailed && (listing.imageUrl || CATEGORY_IMAGES[listing.category]);

  const handleClaim = async () => {
    if (!user) {
      toast("Log in to claim surplus food", "info");
      return;
    }
    setClaiming(true);
    try {
      const { claim } = await api.createClaim(listing._id);
      setStatus("reserved");
      toast(
        `Reserved! Show code ${claim.pickupCode} at pickup.`,
        "success"
      );
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
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-forest-500/15 via-cream-100 to-warm-orange-500/15">
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
            ? "expiring soon"
            : listing.urgencyLevel}
        </span>
        {listing.distanceKm != null && (
          <span className="absolute right-3 top-3 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-forest-600 backdrop-blur-sm">
            📍 {listing.distanceKm} km
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-heading text-lg font-bold text-forest-700 transition-colors group-hover:text-warm-orange-600">
          {listing.title}
        </h3>
        <p className="mt-1 text-sm text-forest-600/75">
          {listing.providerName || "Local provider"} ·{" "}
          {listing.quantity} {listing.unit || "portions"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-forest-600/80">
          <span>⏰ {timeLeft(listing.expiryEstimate)}</span>
          <span>
            🕒 pickup{" "}
            {new Date(listing.pickupWindow?.start).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            –
            {new Date(listing.pickupWindow?.end).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
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
            {claiming ? "Reserving…" : "Claim this food"}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-full bg-forest-500/10 px-5 py-2.5 text-sm font-bold text-forest-600">
            <span className="inline-block h-2 w-2 animate-pulse-soft rounded-full bg-forest-500" />
            {status === "reserved" ? "Reserved" : "No longer available"}
          </div>
        )}
      </div>
    </article>
  );
}
