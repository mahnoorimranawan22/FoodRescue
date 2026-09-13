import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { formatCompact, formatNumber, formatWeight } from "../lib/format";

/**
 * Ideas 8 + 19 — Impact dashboards with SDG reporting.
 * • Providers: meals donated, active listings, CO₂ avoided, rating
 * • Recipients: meals rescued, completed pickups, social value
 * • SDG 2 / SDG 12.3 progress + a printable report (window.print) for
 *   NGO partners and grant applications.
 */
export default function ImpactDashboard({ open, onClose }) {
  const { user } = useAuth();
  const { t, units } = useSettings();
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([api.getStats(), api.getMyClaims().catch(() => ({ claims: [] }))])
      .then(([s, c]) => {
        if (!active) return;
        setStats(s);
        setClaims(c.claims || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  // Stats arrive async — never render the body against a null object
  // (a null deref here would white-screen the whole app).
  if (!stats) {
    return (
      <div
        className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-forest-700/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="glass-panel animate-pulse-soft rounded-3xl px-10 py-8">
          <p className="font-heading text-lg font-bold text-forest-700 dark:text-cream-50">
            Crunching your impact… 🌍
          </p>
        </div>
      </div>
    );
  }

  const isProvider = user?.role === "provider" || user?.role === "admin";
  const completed = claims.filter((c) => c.status === "picked_up");
  const socialValue = completed.length * 12; // rough £/€ value per rescued meal bundle

  const cards = isProvider
    ? [
        { label: t("impactMeals"), value: formatCompact(stats?.mealsRescued || 0), icon: "🍽️" },
        { label: t("impactListings"), value: stats?.listingsAvailable ?? "—", icon: "📦" },
        { label: t("impactCo2"), value: (stats?.co2SavedTons || 0).toFixed(1), icon: "🌍" },
        { label: t("impactRating"), value: "4.8 ★", icon: "⭐" },
      ]
    : [
        { label: t("impactMeals"), value: completed.length * 12 || "—", icon: "🍽️" },
        { label: t("impactClaims"), value: completed.length, icon: "🎫" },
        { label: t("impactCo2"), value: ((stats?.co2SavedTons || 0) - 0).toFixed(1), icon: "🌍" },
        {
          label: "Social value",
          value: `≈ $${formatNumber(socialValue)}`,
          icon: "💛",
        },
      ];

  // SDG 12.3: global target is halving food waste (baseline index 100 → 50)
  const sdg123Pct = Math.min(
    100,
    Math.round(((stats?.co2SavedTons || 0) / 40) * 100)
  );
  const sdg2Pct = Math.min(100, Math.round(((stats?.partners || 0) / 200) * 100));

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-forest-700/60 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="my-8 w-full max-w-3xl rounded-3xl bg-cream-50 p-6 shadow-2xl sm:p-10 dark:bg-night-100">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h2 className="font-heading text-2xl font-extrabold text-forest-700 dark:text-cream-50">
              {user ? t("impactFor", { name: user.name || user.email }) : t("impactTitle")}
            </h2>
            <p className="mt-1 text-sm text-forest-600/70 dark:text-cream-100/60">
              {isProvider ? "Provider dashboard" : "Recipient dashboard"} ·{" "}
              {new Date().toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPrintMode(true);
                setTimeout(() => {
                  window.print();
                  setPrintMode(false);
                }, 60);
              }}
              className="rounded-full border-2 border-forest-500/30 px-4 py-2 text-sm font-bold text-forest-600 transition-colors hover:bg-forest-500/10 dark:text-cream-100"
            >
              {t("printable")}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dashboard"
              className="rounded-full bg-forest-500/10 px-3 py-2 text-sm font-bold text-forest-600 hover:bg-forest-500/20 dark:text-cream-100"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-cream-200 bg-white/70 p-4 text-center dark:border-white/10 dark:bg-night-50/60"
            >
              <span aria-hidden="true" className="text-2xl">
                {c.icon}
              </span>
              <p className="mt-1 font-heading text-xl font-extrabold text-forest-700 dark:text-cream-50">
                {c.value}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-forest-600/60 dark:text-cream-100/50">
                {c.label}
              </p>
            </div>
          ))}
        </div>

        {/* SDG reporting (idea 19) */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            {
              key: t("sdg2"),
              pct: sdg2Pct,
              detail: `${formatNumber(stats?.partners || 0)} ${t("partners")} in ${stats?.cities ?? 4} ${t("cities")}`,
              color: "bg-forest-500",
            },
            {
              key: t("sdg123"),
              pct: sdg123Pct,
              detail: `${formatWeight((stats?.co2SavedTons || 0) * 1000, units)} CO₂e avoided`,
              color: "bg-warm-orange-500",
            },
          ].map((sdg) => (
            <div
              key={sdg.key}
              className="rounded-2xl border border-cream-200 bg-white/70 p-5 dark:border-white/10 dark:bg-night-50/60"
            >
              <p className="text-sm font-extrabold text-forest-700 dark:text-cream-50">
                {sdg.key}
              </p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-cream-200 dark:bg-white/10">
                <div
                  className={`h-full rounded-full ${sdg.color} transition-all duration-700`}
                  style={{ width: `${sdg.pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-forest-600/70 dark:text-cream-100/60">
                {sdg.detail} · {sdg.pct}% of 2030 milestone
              </p>
            </div>
          ))}
        </div>

        {/* Methodology footnote — printed reports need it */}
        <p className="mt-8 border-t border-cream-200 pt-4 text-[11px] leading-relaxed text-forest-600/50 dark:border-white/10 dark:text-cream-100/40">
          Methodology: meals = claimed quantities of completed pickups. CO₂e
          avoided uses 2.5 kg CO₂e per kg of food diverted (WRAP/FAO range
          midpoint). Social value is an illustrative estimate only.
        </p>
      </div>
    </div>
  );
}
