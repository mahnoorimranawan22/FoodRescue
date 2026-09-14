import { useEffect, useMemo, useState } from "react";
import Reveal from "../components/Reveal";
import api from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { formatNumber, formatCompact } from "../lib/format";

/** Eased count-up for the metric counters (respects the final value exactly). */
function useCountUp(target, duration = 1300) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function MetricCard({ icon, value, label, sub, delay = 0 }) {
  const animated = useCountUp(value);
  return (
    <Reveal delay={delay}>
      <div className="glass-panel h-full p-6 text-center transition-shadow duration-300 hover:shadow-forest-glow">
        <span aria-hidden="true" className="text-3xl">
          {icon}
        </span>
        <p className="mt-3 font-heading text-4xl font-extrabold tabular-nums text-forest-700 dark:text-cream-50">
          {formatNumber(Math.round(animated))}
        </p>
        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-forest-600/60 dark:text-cream-100/50">
          {label}
        </p>
        {sub && (
          <p className="mt-1 text-xs text-forest-600/70 dark:text-cream-100/60">{sub}</p>
        )}
      </div>
    </Reveal>
  );
}

/**
 * Monthly rescue-trend bar chart — pure Tailwind + CSS transitions (no chart
 * library): bars grow in on mount, the current month is highlighted orange,
 * and each bar carries a title tooltip with the month's kg too.
 */
function TrendChart({ monthly }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGrown(true), 150);
    return () => clearTimeout(id);
  }, []);
  const max = Math.max(...monthly.map((m) => m.meals), 1);

  return (
    <div
      className="flex h-64 items-end justify-between gap-2 sm:gap-4"
      role="img"
      aria-label={monthly.map((m) => `${m.label}: ${m.meals}`).join(", ")}
    >
      {monthly.map((m, i) => {
        const pct = Math.max(4, Math.round((m.meals / max) * 100));
        const current = i === monthly.length - 1;
        return (
          <div
            key={m.month}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="text-xs font-extrabold tabular-nums text-forest-700 dark:text-cream-50">
              {formatCompact(m.meals)}
            </span>
            <div
              className={`w-full max-w-16 rounded-t-xl transition-all duration-700 ease-out ${
                current
                  ? "bg-gradient-to-t from-warm-orange-600 to-warm-orange-400 shadow-orange-glow"
                  : "bg-gradient-to-t from-forest-600 to-forest-500 hover:opacity-80"
              }`}
              style={{
                height: grown ? `${pct}%` : "0%",
                transitionDelay: `${i * 90}ms`,
              }}
              title={`${m.label}: ${formatNumber(m.meals)} meals · ${m.kg} kg`}
            />
            <span
              className={`text-[11px] font-bold ${
                current
                  ? "text-warm-orange-600"
                  : "text-forest-600/70 dark:text-cream-100/60"
              }`}
            >
              {m.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const RANK_STYLES = [
  "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950", // 🥇
  "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800", // 🥈
  "bg-gradient-to-br from-amber-600 to-amber-800 text-amber-50", // 🥉
];

/**
 * Public Impact & Leaderboard page — metric counters (meals rescued, kg
 * diverted, active partners), a monthly rescue-trend chart, and the
 * gamified provider leaderboard with badges.
 */
export default function Impact({ onExit }) {
  const { t } = useSettings();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .getStats()
      .then((s) => active && setStats(s))
      .catch((e) => active && setError(e.message || "Could not load impact data"));
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(
    () => [
      {
        icon: "🍽️",
        value: stats?.mealsRescued,
        label: t("metricMeals"),
        sub: "↑ growing every month",
      },
      {
        icon: "⚖️",
        value: stats?.kgDiverted,
        label: t("metricKg"),
        sub: `≈ ${(Number(stats?.kgDiverted || 0) / 1000).toFixed(1)} tonnes kept out of landfill`,
      },
      {
        icon: "🤝",
        value: stats?.partners,
        label: t("metricPartners"),
        sub: `${stats?.cities || 4} cities and counting`,
      },
      {
        icon: "📋",
        value: stats?.listingsAvailable,
        label: t("metricListings"),
        sub: "live surplus you can rescue now",
      },
    ],
    [stats, t]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Reveal>
        <span className="inline-flex items-center gap-2 rounded-full border border-forest-500/25 bg-forest-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-cream-100/80">
          🌍 {t("impactPageBadge")}
        </span>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="ml-3 text-xs font-semibold text-forest-600/60 underline decoration-dotted underline-offset-2 hover:text-forest-700 dark:text-cream-100/50"
          >
            ← back to site
          </button>
        )}
        <h1 className="mt-3 font-heading text-3xl font-extrabold text-forest-700 sm:text-4xl dark:text-cream-50">
          {t("impactPageTitle")}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-forest-700/70 dark:text-cream-100/70">
          {t("impactPageIntro")}
        </p>
      </Reveal>

      {/* ─── Impact metric counters ─────────────────────────────────────── */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => (
          <MetricCard
            key={m.label}
            icon={m.icon}
            value={m.value}
            label={m.label}
            sub={m.sub}
            delay={i * 70}
          />
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* ─── Impact visualization: monthly trend ────────────────────────── */}
      <Reveal delay={80}>
        <section className="glass-panel mt-12 p-6 sm:p-10">
          <h2 className="font-heading text-xl font-bold text-forest-700 dark:text-cream-50">
            📈 {t("trendTitle")}
          </h2>
          <p className="mt-1 text-sm text-forest-600/70 dark:text-cream-100/60">
            {t("trendIntro")}
          </p>
          <div className="mt-8">
            {stats ? (
              <TrendChart monthly={stats.monthly || []} />
            ) : (
              <div className="flex h-64 items-end gap-4" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 animate-pulse-soft rounded-t-xl bg-forest-500/20"
                    style={{ height: `${30 + ((i * 13) % 60)}%` }}
                  />
                ))}
              </div>
            )}
          </div>
          <p className="mt-6 text-[11px] text-forest-600/50 dark:text-cream-100/40">
            {formatNumber(stats?.monthly?.reduce((s, m) => s + m.meals, 0) || 0)}{" "}
            {t("trendMeals")} · {formatNumber(Number(stats?.kgDiverted || 0))} kg total
          </p>
        </section>
      </Reveal>

      {/* ─── Gamification leaderboard ───────────────────────────────────── */}
      <Reveal delay={120}>
        <section className="glass-panel mt-12 p-6 sm:p-10">
          <h2 className="font-heading text-xl font-bold text-forest-700 dark:text-cream-50">
            🏆 {t("leaderboardTitle")}
          </h2>
          <p className="mt-1 text-sm text-forest-600/70 dark:text-cream-100/60">
            {t("leaderboardIntro")}
          </p>

          {!stats ? (
            <div className="mt-6 space-y-2" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse-soft rounded-xl bg-forest-500/10"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          ) : (stats.leaderboard || []).length === 0 ? (
            <p className="mt-6 py-8 text-center text-sm text-forest-600/70 dark:text-cream-100/60">
              {t("lbEmpty")}
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-forest-600/50 dark:text-cream-100/40">
                    <th className="px-3 py-2">{t("lbRank")}</th>
                    <th className="px-3 py-2">{t("lbProvider")}</th>
                    <th className="px-3 py-2">{t("lbBadge")}</th>
                    <th className="px-3 py-2 text-right">{t("lbMeals")}</th>
                    <th className="px-3 py-2 text-right">{t("lbKg")}</th>
                    <th className="px-3 py-2 text-right">{t("lbRescues")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.leaderboard.map((p) => (
                    <tr
                      key={p._id || p.rank}
                      className="border-t border-cream-200 transition-colors hover:bg-forest-500/5 dark:border-white/10"
                    >
                      <td className="px-3 py-3">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${
                            RANK_STYLES[p.rank - 1] ||
                            "bg-cream-100 text-forest-600 dark:bg-night-100 dark:text-cream-100/80"
                          }`}
                        >
                          {p.rank}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-bold text-forest-700 dark:text-cream-50">
                        {p.name}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-forest-500/10 px-2.5 py-1 text-[11px] font-bold text-forest-600 dark:bg-forest-500/20 dark:text-cream-100/85">
                          {p.badge}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold tabular-nums text-warm-orange-600">
                        {formatNumber(p.meals)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-forest-700/80 dark:text-cream-100/75">
                        {formatNumber(p.kg)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-forest-600/70 dark:text-cream-100/60">
                        {formatNumber(p.rescues)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Reveal>

      {/* Trust footnote */}
      <Reveal delay={140}>
        <p className="mt-10 text-center text-[11px] text-forest-600/50 dark:text-cream-100/40">
          🌱 Meals = portions collected · kg = listing weights · CO₂e estimated at
          2.5 kg per kg of food (Poore &amp; Nemecek 2018). Counters blend live
          rescues with the network's launch cohort.
        </p>
      </Reveal>
    </div>
  );
}
