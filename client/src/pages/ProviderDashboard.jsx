import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import ListSurplusModal from "../components/ListSurplusModal";
import Reveal from "../components/Reveal";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import { formatDistance, formatTime } from "../lib/format";

const STATUS_STYLES = {
  available: "bg-forest-500/10 text-forest-600 ring-forest-500/30",
  reserved: "bg-warm-orange-500/15 text-warm-orange-600 ring-warm-orange-500/40",
  completed: "bg-forest-500/10 text-forest-600 ring-forest-500/30",
  cancelled: "bg-red-100 text-red-700 ring-red-300/60",
};

/**
 * Provider dashboard — analytics overview, "+ List Surplus Food" modal with
 * Groq AI auto-classification pre-filling categories, and the active listings
 * list receiving real-time claim updates via socket.io-client.
 */
export default function ProviderDashboard({ onExit }) {
  const { user } = useAuth();
  const toast = useToast();
  const { t, units, tz } = useSettings();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(() => {
    api
      .getProviderListings("all")
      .then((data) => setListings(data.listings || []))
      .catch((err) => toast(err.message || "Could not load your listings", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Real-time claim updates via socket.io-client: any listing event
     (new claim, pickup, release, cancellation) refreshes silently. */
  useEffect(() => {
    const dispose = api.subscribeFeed({ onUpdate: () => load() });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  /* ─── analytics ─────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const active = listings.filter((l) => ["available", "reserved"].includes(l.status));
    const rescued = listings.filter((l) => l.status === "completed");
    return {
      activeCount: active.length,
      reservedCount: active.filter((l) => l.status === "reserved").length,
      rescuedCount: rescued.length,
      rescuedItems: rescued.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
      co2Kg: rescued.reduce((sum, l) => sum + (Number(l.weightKg) || 0) * 2.5, 0),
    };
  }, [listings]);

  const handleCancel = async (listingId) => {
    setCancellingId(listingId);
    try {
      await api.cancelListing(listingId);
      toast("Listing cancelled — food can no longer be claimed", "info");
      load();
    } catch (err) {
      toast(err.message || "Could not cancel listing", "error");
    } finally {
      setCancellingId(null);
    }
  };

  const statCards = [
    { icon: "📋", label: "Active Listings", value: stats.activeCount, sub: `${stats.reservedCount} reserved right now` },
    { icon: "🎉", label: "Items Rescued", value: stats.rescuedItems, sub: `${stats.rescuedCount} completed listings` },
    { icon: "🌍", label: "Community Impact", value: `${(stats.co2Kg / 1000).toFixed(1)}t`, sub: "CO₂e avoided (food-waste factor 2.5)" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-forest-500/25 bg-forest-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-cream-100/80">
              🏪 Provider dashboard
            </span>
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="ml-2 text-xs font-semibold text-forest-600/60 underline decoration-dotted underline-offset-2 hover:text-forest-700 dark:text-cream-100/50"
              >
                ← back to site
              </button>
            )}
            <h1 className="mt-3 font-heading text-3xl font-extrabold text-forest-700 sm:text-4xl dark:text-cream-50">
              Welcome back, {user?.name?.split(" ")[0] || "Provider"}
            </h1>
            <p className="mt-2 max-w-xl text-forest-700/70 dark:text-cream-100/70">
              Publish surplus, watch claims arrive live, and confirm handovers with pickup codes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="rounded-full bg-warm-orange-500 px-6 py-3 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600"
          >
            + List Surplus Food
          </button>
        </div>
      </Reveal>

      {/* Analytics cards */}
      <Reveal delay={60}>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {statCards.map((c) => (
            <div key={c.label} className="glass-panel p-6">
              <span aria-hidden="true" className="text-2xl">{c.icon}</span>
              <p className="mt-3 font-heading text-3xl font-extrabold text-forest-700 dark:text-cream-50">
                {c.value}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-forest-600/60 dark:text-cream-100/50">
                {c.label}
              </p>
              <p className="mt-1 text-xs text-forest-600/70 dark:text-cream-100/60">{c.sub}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Active listings with real-time claim updates */}
      <Reveal delay={100}>
        <h2 className="mt-12 font-heading text-xl font-bold text-forest-700 dark:text-cream-50">
          Your listings <span className="text-sm font-semibold text-forest-600/60 dark:text-cream-100/50">(live)</span>
        </h2>
        {loading ? (
          <div className="glass-panel mt-4 h-32 animate-pulse-soft" />
        ) : listings.length === 0 ? (
          <div className="glass-panel mt-4 py-12 text-center">
            <p className="text-4xl" aria-hidden="true">📦</p>
            <p className="mt-3 font-heading font-bold text-forest-700 dark:text-cream-50">
              No listings yet
            </p>
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="mt-4 rounded-full bg-warm-orange-500 px-6 py-2.5 text-sm font-bold text-white shadow-orange-glow transition-all hover:bg-warm-orange-600"
            >
              + List your first surplus
            </button>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {listings.map((l) => (
              <li
                key={l._id}
                className="rounded-2xl border border-cream-200 bg-white/70 p-4 transition-shadow hover:shadow-forest-glow dark:border-white/10 dark:bg-night-50/60"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-heading text-sm font-bold text-forest-700 dark:text-cream-50">
                        {l.title}
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${STATUS_STYLES[l.status] || STATUS_STYLES.available}`}>
                        {l.status === "reserved" ? "🟡 reserved" : l.status === "completed" ? "✓ completed" : "🟢 available"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-forest-600/70 dark:text-cream-100/60">
                      {l.quantity} {l.unit || "portions"} · pickup {formatTime(l.pickupWindow?.start, tz)}–{formatTime(l.pickupWindow?.end, tz)}
                      {l.pickupAddress ? ` · ${l.pickupAddress}` : ""}
                    </p>

                    {/* Live claim info: who reserved + the verification code */}
                    {l.activeClaims?.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {l.activeClaims.map((c) => (
                          <span
                            key={c._id || c.pickupCode}
                            className="inline-flex items-center gap-2 rounded-full bg-warm-orange-500/10 px-3 py-1 text-xs font-bold text-warm-orange-600"
                          >
                            🎫 {c.recipientName} · code <span className="font-mono tracking-widest">{c.pickupCode}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {["available", "reserved"].includes(l.status) && (
                    <button
                      type="button"
                      onClick={() => handleCancel(l._id)}
                      disabled={cancellingId === l._id}
                      className="shrink-0 rounded-full border-2 border-red-200 px-4 py-2 text-xs font-bold text-red-600 transition-colors hover:border-red-400 hover:bg-red-50 disabled:opacity-60 dark:border-red-400/30 dark:bg-red-400/5"
                    >
                      {cancellingId === l._id ? "Cancelling…" : "Cancel listing"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      {/* + List Surplus Food modal (Groq AI auto-classification inside) */}
      <ListSurplusModal
        open={listOpen}
        onClose={() => setListOpen(false)}
        onCreated={() => load()}
      />
    </div>
  );
}
