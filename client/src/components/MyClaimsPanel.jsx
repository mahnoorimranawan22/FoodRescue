import { useEffect, useState } from "react";
import api from "../lib/api";
import { useToast } from "./Toast";

const STATUS_STYLES = {
  reserved: "bg-warm-orange-500/15 text-warm-orange-600 ring-warm-orange-500/40",
  picked_up: "bg-forest-500/10 text-forest-600 ring-forest-500/30",
  cancelled: "bg-red-100 text-red-700 ring-red-300/60",
};

/**
 * "My Claims" — the recipient's reservations with their 4-digit pickup codes.
 * Providers confirm handover by matching the code (offline demo: the recipient
 * types the code themselves; live server: PATCH /claims/:id/pickup).
 */
export default function MyClaimsPanel({ refreshKey = 0 }) {
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getMyClaims()
      .then((data) => {
        if (active) setClaims(data.claims || []);
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
      toast("Pickup confirmed — meal saved! 🎉", "success");
      setClaims((list) =>
        list.map((c) => (c._id === claimId ? { ...c, ...claim } : c))
      );
    } catch (err) {
      toast(err.message || "Could not confirm pickup", "error");
    }
  };

  if (loading) {
    return (
      <p className="animate-pulse-soft py-6 text-center text-sm font-semibold text-forest-600/70">
        Loading your reservations…
      </p>
    );
  }

  if (claims.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-forest-600/70">
        No claims yet — head to Discover and rescue something delicious.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {claims.map((claim) => (
        <li
          key={claim._id}
          className="flex flex-col gap-3 rounded-2xl border border-cream-200 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold text-forest-700">
              {claim.listingTitle || "Surplus listing"}
            </p>
            <p className="mt-0.5 text-xs text-forest-600/70">
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
                className="w-24 rounded-xl border border-cream-200 bg-white px-3 py-2 text-center font-heading text-lg font-bold tracking-[0.3em] text-forest-700 placeholder:tracking-normal placeholder:text-forest-600/30 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30"
              />
              <button
                type="button"
                onClick={() => confirm(claim._id)}
                className="rounded-full bg-forest-500 px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2"
              >
                Confirm pickup
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
