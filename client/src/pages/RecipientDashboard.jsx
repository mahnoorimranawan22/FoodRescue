import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Reveal from "../components/Reveal";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import { formatWindow } from "../lib/format";

const STAGES = ["Reserved", "Ready for Pickup", "Completed"];

/** Green FoodRescue pin (bundlers break Leaflet's default icon URLs). */
function foodPin() {
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;font-size:19px;background:#2D5A27;border:2.5px solid #FAF8F5;border-radius:9999px;box-shadow:0 4px 10px rgba(20,43,18,.4)">📍</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function MapFly({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 15, { animate: true });
  }, [center?.[0], center?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Where in the pickup window we are right now, for the stepper state. */
function windowState(claim) {
  const now = Date.now();
  const start = new Date(claim.pickupWindow?.start).getTime();
  const end = new Date(claim.pickupWindow?.end).getTime();
  if (Number.isFinite(start) && now >= start && now <= end) return "open";
  if (Number.isFinite(start) && now < start) return "upcoming";
  return "closed";
}

/**
 * Recipient dashboard — tracks every claim through its lifecycle
 * (Reserved → Ready for Pickup → Completed), shows the 4-digit verification
 * code, exact pickup instructions (address, window, provider phone) with a
 * map of the handover point, and a button to confirm a successful pickup.
 */
export default function RecipientDashboard({ onExit }) {
  const { user } = useAuth();
  const toast = useToast();
  const { t, units, tz } = useSettings();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [activeMapId, setActiveMapId] = useState(null);

  const load = useCallback(() => {
    api
      .getMyClaims()
      .then((data) => setClaims(data.claims || []))
      .catch((err) => toast(err.message || "Could not load your claims", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Real-time refresh so provider-confirmed pickups appear instantly */
  useEffect(() => {
    const dispose = api.subscribeFeed({ onUpdate: () => load() });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const stats = useMemo(() => {
    const active = claims.filter((c) => c.status === "reserved");
    const done = claims.filter((c) => c.status === "picked_up");
    return {
      active: active.length,
      done: done.length,
      items: done.reduce((sum, c) => sum + (Number(c.quantity) || 1), 0),
    };
  }, [claims]);

  const confirmPickup = async (claimId) => {
    setConfirmingId(claimId);
    try {
      const { claim } = await api.confirmReceived(claimId);
      toast(t("pickupConfirmed"), "success");
      setClaims((list) =>
        list.map((c) => (c._id === claimId ? { ...c, ...claim } : c))
      );
    } catch (err) {
      toast(err.message || "Could not confirm pickup", "error");
      load();
    } finally {
      setConfirmingId(null);
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast(`Code ${code} copied`, "success");
    } catch {
      toast(`Your pickup code: ${code}`, "info");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Reveal>
        <span className="inline-flex items-center gap-2 rounded-full border border-forest-500/25 bg-forest-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-cream-100/80">
          🤝 Recipient dashboard
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
          Welcome back, {user?.name?.split(" ")[0] || "Friend"}
        </h1>
        <p className="mt-2 max-w-xl text-forest-700/70 dark:text-cream-100/70">
          Track your reservations, grab the pickup code, and confirm each rescue at handover.
        </p>
      </Reveal>

      {/* Analytics */}
      <Reveal delay={60}>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: "🎫", label: "Active claims", value: stats.active },
            { icon: "🎉", label: "Completed pickups", value: stats.done },
            { icon: "🍽️", label: "Meals rescued", value: stats.items },
          ].map((c) => (
            <div key={c.label} className="glass-panel p-6">
              <span aria-hidden="true" className="text-2xl">{c.icon}</span>
              <p className="mt-3 font-heading text-3xl font-extrabold text-forest-700 dark:text-cream-50">
                {c.value}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-forest-600/60 dark:text-cream-100/50">
                {c.label}
              </p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Claims */}
      <Reveal delay={100}>
        <h2 className="mt-12 font-heading text-xl font-bold text-forest-700 dark:text-cream-50">
          Your claims <span className="text-sm font-semibold text-forest-600/60 dark:text-cream-100/50">(live)</span>
        </h2>
        {loading ? (
          <div className="glass-panel mt-4 h-40 animate-pulse-soft" />
        ) : claims.length === 0 ? (
          <div className="glass-panel mt-4 py-12 text-center">
            <p className="text-4xl" aria-hidden="true">🧺</p>
            <p className="mt-3 font-heading font-bold text-forest-700 dark:text-cream-50">
              {t("noClaims")}
            </p>
            <a
              href="/#discover"
              className="mt-4 inline-block rounded-full bg-warm-orange-500 px-6 py-2.5 text-sm font-bold text-white shadow-orange-glow transition-all hover:-translate-y-0.5 hover:bg-warm-orange-600"
            >
              {t("heroCta1")}
            </a>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {claims.map((claim) => {
              const isReserved = claim.status === "reserved";
              const isDone = claim.status === "picked_up";
              const wState = isReserved ? windowState(claim) : null;
              const stageIdx = isDone ? 2 : isReserved ? 1 : 0;
              const coords = claim.location?.coordinates;
              const showMap = activeMapId === claim._id && coords?.length === 2;
              return (
                <li
                  key={claim._id}
                  className="rounded-2xl border border-cream-200 bg-white/70 p-5 transition-shadow hover:shadow-forest-glow dark:border-white/10 dark:bg-night-50/60"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-base font-bold text-forest-700 dark:text-cream-50">
                          {claim.listingTitle}
                        </h3>
                        {isReserved && (
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
                            wState === "open"
                              ? "animate-pulse-soft bg-forest-500/15 text-forest-600 ring-forest-500/40"
                              : "bg-warm-orange-500/15 text-warm-orange-600 ring-warm-orange-500/40"
                          }`}>
                            {wState === "open" ? "🟢 window open now" : wState === "upcoming" ? "🟡 upcoming" : "🔴 window closed"}
                          </span>
                        )}
                        {isDone && (
                          <span className="rounded-full bg-forest-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-forest-600 ring-1 ring-forest-500/30">
                            ✓ completed
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-forest-600/70 dark:text-cream-100/60">
                        {claim.quantity} {claim.unit || "portions"} · {claim.providerName}
                        {claim.providerPhone ? ` · ☎ ${claim.providerPhone}` : ""}
                      </p>

                      {/* Lifecycle stepper: Reserved → Ready for Pickup → Completed */}
                      <ol className="mt-4 flex items-center gap-1.5" aria-label="Claim progress">
                        {STAGES.map((stage, i) => (
                          <li key={stage} className="flex flex-1 items-center gap-1.5">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                                i < stageIdx
                                  ? "bg-forest-500 text-white"
                                  : i === stageIdx && isReserved
                                    ? "animate-pulse-soft bg-warm-orange-500 text-white"
                                    : i === stageIdx
                                      ? "bg-forest-500 text-white"
                                      : "bg-cream-200 text-forest-600/50 dark:bg-night-100 dark:text-cream-100/40"
                              }`}
                              aria-current={i === stageIdx ? "step" : undefined}
                            >
                              {i < stageIdx ? "✓" : i + 1}
                            </span>
                            <span
                              className={`hidden text-[11px] font-bold sm:block ${
                                i <= stageIdx
                                  ? "text-forest-700 dark:text-cream-50"
                                  : "text-forest-600/40 dark:text-cream-100/30"
                              }`}
                            >
                              {stage}
                            </span>
                            {i < STAGES.length - 1 && (
                              <span
                                aria-hidden="true"
                                className={`h-0.5 flex-1 rounded ${i < stageIdx ? "bg-forest-500" : "bg-cream-200 dark:bg-night-100"}`}
                              />
                            )}
                          </li>
                        ))}
                      </ol>

                      {/* Pickup instructions */}
                      {isReserved && (
                        <div className="mt-4 grid gap-3 rounded-2xl bg-cream-100/80 p-4 text-sm dark:bg-night-100 sm:grid-cols-2">
                          <p className="flex items-start gap-2 text-forest-700/85 dark:text-cream-100/80">
                            <span aria-hidden="true">🕒</span>
                            <span>
                              <strong>Pickup window:</strong>{" "}
                              {formatWindow(claim.pickupWindow, tz) || "—"}
                              <span className="block text-xs text-forest-600/60 dark:text-cream-100/50">
                                {wState === "upcoming" ? "not open yet — come back at the start time" : "shown in your timezone"}
                              </span>
                            </span>
                          </p>
                          <p className="flex items-start gap-2 text-forest-700/85 dark:text-cream-100/80">
                            <span aria-hidden="true">📍</span>
                            <span>
                              <strong>Pickup from:</strong>{" "}
                              {claim.pickupAddress || "see map location"}
                            </span>
                          </p>
                        </div>
                      )}

                      {/* 4-digit verification code */}
                      {isReserved && (
                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600/60 dark:text-cream-100/50">
                              Verification code
                            </span>
                            <span
                              className="rounded-xl bg-forest-600 px-4 py-1.5 font-heading text-2xl font-extrabold tracking-[0.35em] text-cream-50 shadow-forest-glow"
                              aria-label={`Pickup code ${claim.pickupCode}`}
                            >
                              {claim.pickupCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyCode(claim.pickupCode)}
                              className="rounded-full border-2 border-forest-500/25 px-3 py-1.5 text-xs font-bold text-forest-600 transition-colors hover:bg-forest-500/10 dark:text-cream-100"
                            >
                              Copy
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveMapId(activeMapId === claim._id ? null : claim._id)
                            }
                            className="text-xs font-bold text-forest-600 underline decoration-dotted underline-offset-2 hover:text-forest-700 dark:text-cream-100/80"
                          >
                            {showMap ? "Hide map" : "🗺 Show on map"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action: confirm successful pickup */}
                    {isReserved && (
                      <div className="flex shrink-0 flex-col items-stretch gap-2 lg:w-52">
                        <button
                          type="button"
                          onClick={() => confirmPickup(claim._id)}
                          disabled={confirmingId === claim._id}
                          className="rounded-full bg-forest-600 px-5 py-3 text-sm font-bold text-white shadow-forest-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest-700 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2"
                        >
                          {confirmingId === claim._id ? "Confirming…" : "✓ Confirm Pickup"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.cancelClaim(claim._id);
                              toast("Reservation released", "info");
                              load();
                            } catch (err) {
                              toast(err.message || "Could not cancel", "error");
                            }
                          }}
                          className="text-xs font-semibold text-forest-600/60 hover:text-red-600 dark:text-cream-100/50"
                        >
                          Cancel reservation
                        </button>
                      </div>
                    )}
                    {isDone && (
                      <p className="shrink-0 text-xs font-semibold text-forest-600/70 dark:text-cream-100/60 lg:w-52">
                        🎉 Picked up{" "}
                        {claim.pickedUpAt
                          ? new Date(claim.pickedUpAt).toLocaleDateString()
                          : ""}
                        {claim.rating > 0
                          ? ` · rated ${"★".repeat(claim.rating)}`
                          : " · rate it in My Claims"}
                      </p>
                    )}
                  </div>

                  {/* Map of the exact handover point */}
                  {showMap && (
                    <div className="animate-fade-in mt-4 overflow-hidden rounded-2xl ring-1 ring-cream-200 dark:ring-white/10">
                      <MapContainer
                        center={[coords[1], coords[0]]}
                        zoom={15}
                        scrollWheelZoom={false}
                        className="z-0 h-56 w-full"
                        role="application"
                        aria-label={`Pickup location for ${claim.listingTitle}`}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapFly center={[coords[1], coords[0]]} />
                        <Marker position={[coords[1], coords[0]]} icon={foodPin()} />
                      </MapContainer>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Reveal>
    </div>
  );
}
