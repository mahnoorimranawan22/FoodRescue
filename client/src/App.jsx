import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "./components/Navbar";
import ListingCard from "./components/ListingCard";
import MapView from "./components/MapView";
import MyClaimsPanel from "./components/MyClaimsPanel";
import AuthModal from "./components/AuthModal";
import ListSurplusModal from "./components/ListSurplusModal";
import ImpactDashboard from "./components/ImpactDashboard";
import Reveal from "./components/Reveal";
import api, { alerts as alertStore } from "./lib/api";
import { HERO_IMAGES, ABOUT_IMAGES, CATEGORY_IMAGES } from "./lib/images";
import { CITIES, cityById, distanceTo, getPositionCached } from "./lib/geo";
import { formatNumber } from "./lib/format";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { ToastProvider, useToast } from "./components/Toast";

const STEPS = [
  {
    icon: "🍽️",
    title: "Businesses list surplus",
    body: "Restaurants, grocers and events post what's left — quantities, pickup window, location.",
  },
  {
    icon: "🤝",
    title: "Charities claim instantly",
    body: "Verified local organizations browse nearby listings and claim what they can collect.",
  },
  {
    icon: "🌎",
    title: "Good food gets eaten",
    body: "Meals reach plates instead of landfill — tracked, credited and shared by the community.",
  },
];

const FILTERS = [
  { key: "all", label: "filterAll", emoji: "🌍" },
  { key: "Prepared Food", label: "filterPrepared", emoji: "🍲" },
  { key: "Bakery", label: "filterBakery", emoji: "🥖" },
  { key: "Produce", label: "filterProduce", emoji: "🥕" },
  { key: "Dairy", label: "filterDairy", emoji: "🧀" },
  { key: "Packaged Goods", label: "filterPackaged", emoji: "🥫" },
];

const TAG_FILTERS = ["vegetarian", "vegan", "halal", "kosher", "gluten-free"];

const TICKER = [
  "12,480 meals rescued",
  "96 partner organizations",
  "18.4t CO₂ saved",
  "4 cities live",
  "100% free for charities",
];

function Ticker() {
  const row = (key) => (
    <div
      key={key}
      className="flex shrink-0 items-center"
      aria-hidden={key === "b" ? true : undefined}
    >
      {TICKER.map((item) => (
        <span
          key={`${key}-${item}`}
          className="mx-6 flex items-center gap-2 text-sm font-bold tracking-wide text-cream-50"
        >
          <span aria-hidden="true">🌱</span>
          {item}
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden bg-forest-700 py-3">
      <div className="animate-marquee flex w-max">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

function DiscoverSection({ onOpenList, refreshSignal }) {
  const toast = useToast();
  const { t, city: settingsCity, setCity } = useSettings();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [tag, setTag] = useState("all");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState(settingsCity?.id || "london");
  const [view, setView] = useState("list");
  const [geoPos, setGeoPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [live, setLive] = useState(false);
  const [savedAlerts, setSavedAlerts] = useState([]);
  const knownIds = useRef(new Set());

  const refreshAlerts = useCallback(
    () => setSavedAlerts(alertStore.all()),
    []
  );
  useEffect(refreshAlerts, [refreshAlerts]);

  /* Silent refresh used by the live feed (no skeleton flash) */
  const silentFetch = useCallback(() => {
    api
      .getListings({ category, urgency, search, tag, cityId: cityFilter })
      .then((data) => {
        const next = data.listings || [];
        // idea 7 — smart alerts: check the incoming batch against saved filters
        for (const listing of next) {
          if (knownIds.current.has(listing._id)) continue;
          knownIds.current.add(listing._id);
          const hit = alertStore
            .all()
            .find((a) => alertStore.matches(a, listing));
          if (hit) {
            toast(`🔔 ${listing.title} — ${t("alertSaved")}`, "info");
          }
        }
        setListings(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, urgency, search, tag, cityFilter]);

  /* Live feed (idea 6): Socket.io on the real server, polling in demo mode */
  useEffect(() => {
    const dispose = api.subscribeFeed({
      onUpdate: () => {
        setLive(true);
        silentFetch();
      },
    });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silentFetch]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .getListings({ category, urgency, search, tag, cityId: cityFilter })
        .then((data) => {
          if (active) {
            setListings(data.listings || []);
            for (const l of data.listings || []) knownIds.current.add(l._id);
          }
        })
        .catch((err) => {
          if (active) toast(err.message || "Could not load listings", "error");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, search ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, urgency, search, tag, cityFilter, refreshSignal]);

  /* idea 1 — "use my location": compute true distances client-side */
  const located = useMemo(() => {
    if (!geoPos) return listings;
    return listings
      .map((l) => ({ ...l, distanceKm: distanceTo(l, geoPos) }))
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  }, [listings, geoPos]);

  const locateMe = async () => {
    setLocating(true);
    try {
      const pos = await getPositionCached();
      setGeoPos(pos);
      toast(t("sortedByDistance"), "success");
    } catch {
      toast("Location unavailable — showing distances from the city center", "error");
    } finally {
      setLocating(false);
    }
  };

  const bumpClaims = () => {
    setRefreshKey((k) => k + 1);
    setClaimsOpen(true);
  };

  const hasActiveFilters =
    category !== "all" || urgency !== "all" || tag !== "all" || !!search;

  const saveCurrentAlert = () => {
    alertStore.save({
      category,
      urgency,
      tag,
      search,
      cityId: cityFilter,
    });
    refreshAlerts();
    toast(t("alertSaved"), "success");
  };

  const urgent = listings.find((l) => l.urgencyLevel === "urgent");
  const spotlight = urgent
    ? {
        ...urgent,
        hoursLeft: Math.max(
          1,
          Math.ceil(
            (new Date(urgent.pickupWindow?.end).getTime() - Date.now()) / 3600000
          )
        ),
      }
    : null;

  const mapCenter = geoPos
    ? { lat: geoPos.lat, lng: geoPos.lng }
    : cityById(cityFilter)
      ? { lat: cityById(cityFilter).lat, lng: cityById(cityFilter).lng }
      : undefined;

  return (
    <section
      id="discover"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8"
    >
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-warm-orange-500/25 bg-warm-orange-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-warm-orange-600">
              {live && (
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-forest-500" />
                </span>
              )}
              {t("discoverBadge")}
            </span>
            <h2 className="mt-4 text-3xl font-extrabold text-forest-700 sm:text-4xl dark:text-cream-50">
              {t("discoverTitle")}
            </h2>
            <p className="mt-3 max-w-xl leading-relaxed text-forest-700/70 dark:text-cream-100/70">
              {t("discoverIntro")}
            </p>
            {!loading && (
              <p className="mt-2 text-sm font-semibold text-forest-600 dark:text-cream-100/70">
                <span className="font-heading text-base font-extrabold text-forest-700 dark:text-cream-50">
                  {listings.length}
                </span>{" "}
                {t("listingsAvailable", { n: listings.length })
                  .replace(/^\S+\s*/, "")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* list / map toggle (idea 1) */}
            <div className="flex rounded-full bg-cream-100 p-1 dark:bg-night-100">
              {[
                { key: "list", label: t("viewList"), icon: "☰" },
                { key: "map", label: t("viewMap"), icon: "🗺️" },
              ].map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
                    view === v.key
                      ? "bg-white text-forest-700 shadow-sm dark:bg-forest-500/40 dark:text-cream-50"
                      : "text-forest-600/60 hover:text-forest-700 dark:text-cream-100/50"
                  }`}
                >
                  <span aria-hidden="true" className="mr-1">{v.icon}</span>
                  {v.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              className="rounded-full border-2 border-forest-500/30 bg-white/70 px-4 py-2 text-sm font-bold text-forest-600 transition-all hover:border-forest-500 hover:bg-forest-500/10 disabled:opacity-60 dark:bg-night-100 dark:text-cream-100"
            >
              📍 {locating ? t("locating") : t("useMyLocation")}
            </button>
            <button
              type="button"
              onClick={() => setClaimsOpen((open) => !open)}
              className="rounded-full border-2 border-forest-500/30 bg-white/70 px-5 py-2 text-sm font-bold text-forest-600 transition-all duration-200 hover:border-forest-500 hover:bg-forest-500/10 dark:bg-night-100 dark:text-cream-100"
            >
              🎫 {t("myClaims")} {claimsOpen ? "▾" : "▸"}
            </button>
          </div>
        </div>
      </Reveal>

      {/* City chips (idea 15) */}
      <Reveal delay={60}>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCityFilter("all")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-all ${
              cityFilter === "all"
                ? "bg-forest-600 text-white shadow-forest-glow"
                : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-forest-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
            }`}
          >
            🌍 {t("allCities")}
          </button>
          {CITIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCityFilter(c.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-all ${
                cityFilter === c.id
                  ? "bg-forest-600 text-white shadow-forest-glow"
                  : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-forest-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
              }`}
            >
              {c.flag} {c.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Filters + search */}
      <Reveal delay={80}>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setCategory(f.key)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-bold transition-all duration-200",
                  category === f.key
                    ? "bg-forest-500 text-white shadow-forest-glow"
                    : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-forest-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10",
                ].join(" ")}
              >
                <span aria-hidden="true" className="mr-1.5">
                  {f.emoji}
                </span>
                {t(f.label)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Filter by urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="rounded-full border border-cream-200 bg-white px-4 py-2 text-sm font-semibold text-forest-600 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30 dark:border-white/10 dark:bg-night-100 dark:text-cream-100"
            >
              <option value="all">{t("urgencyAll")}</option>
              <option value="normal">{t("urgencyNormal")}</option>
              <option value="expiring_soon">{t("urgencySoon")}</option>
              <option value="urgent">{t("urgencyUrgent")}</option>
            </select>
            <input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 rounded-full border border-cream-200 bg-white px-4 py-2 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30 dark:border-white/10 dark:bg-night-100 dark:text-cream-50 lg:w-72"
            />
          </div>
        </div>

        {/* Dietary tag filters (idea 2) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600/50 dark:text-cream-100/40">
            🥗 {t("listTags")}:
          </span>
          {TAG_FILTERS.map((tg) => (
            <button
              key={tg}
              type="button"
              onClick={() => setTag(tag === tg ? "all" : tg)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                tag === tg
                  ? "bg-warm-orange-500 text-white shadow-orange-glow"
                  : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-warm-orange-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
              }`}
            >
              {tg}
            </button>
          ))}
        </div>

        {/* Saved alerts (idea 7) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={saveCurrentAlert}
              className="rounded-full bg-forest-500/10 px-3 py-1 text-xs font-bold text-forest-600 transition-colors hover:bg-forest-500/20 dark:text-cream-100"
            >
              {t("saveAlert")}
            </button>
          )}
          {savedAlerts.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-warm-orange-500/10 px-3 py-1 text-xs font-bold text-warm-orange-600"
            >
              🔔 {[a.category, a.urgency, a.tag].filter((x) => x && x !== "all").join(" · ") ||
                t("savedFilters")}
              <button
                type="button"
                onClick={() => {
                  alertStore.remove(a.id);
                  refreshAlerts();
                  toast(t("alertRemoved"), "info");
                }}
                aria-label="Remove alert"
                className="ml-0.5 text-warm-orange-600/70 hover:text-warm-orange-600"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </Reveal>

      {/* Urgent spotlight */}
      {!loading &&
        spotlight &&
        category === "all" &&
        urgency === "all" &&
        !search && (
          <Reveal delay={140}>
            <button
              type="button"
              onClick={() => {
                setUrgency("urgent");
                document
                  .getElementById("discover")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="group mt-8 flex w-full items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-warm-orange-500/10 via-warm-orange-500/5 to-transparent p-4 text-left ring-1 ring-warm-orange-500/30 transition-all duration-200 hover:from-warm-orange-500/20 hover:shadow-orange-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500"
            >
              {spotlight.imageUrl || CATEGORY_IMAGES[spotlight.category] ? (
                <img
                  src={spotlight.imageUrl || CATEGORY_IMAGES[spotlight.category]}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-warm-orange-500/40"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-warm-orange-500/25 to-warm-orange-500/5 text-2xl ring-1 ring-warm-orange-500/40"
                >
                  ⚠️
                </span>
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-extrabold text-warm-orange-600">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warm-orange-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-warm-orange-500" />
                  </span>
                  {t("spotlight", { h: spotlight.hoursLeft })}
                </p>
                <p className="mt-0.5 truncate text-sm text-forest-700/80 dark:text-cream-100/70">
                  {spotlight.quantity} {spotlight.unit} —{" "}
                  <span className="font-bold text-forest-700 dark:text-cream-50">
                    {spotlight.title}
                  </span>{" "}
                  · {spotlight.providerName}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="ml-auto hidden shrink-0 text-xl text-warm-orange-500 transition-transform duration-200 group-hover:translate-x-1 sm:block"
              >
                →
              </span>
            </button>
          </Reveal>
        )}

      {/* Content: list grid or map */}
      {view === "map" ? (
        <div className="mt-10">
          <MapView listings={located} center={mapCenter} />
          <p className="mt-2 text-center text-xs text-forest-600/60 dark:text-cream-100/50">
            {located.length} {t("listingsAvailable", { n: located.length })}
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="glass-panel h-96 animate-pulse-soft"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))
            : located.map((listing, i) => (
                <Reveal
                  key={listing._id}
                  variant="scale"
                  delay={Math.min(i, 5) * 70}
                >
                  <ListingCard listing={listing} index={i} onClaimed={bumpClaims} />
                </Reveal>
              ))}
        </div>
      )}

      {!loading && view === "list" && listings.length === 0 && (
        <div className="glass-panel mt-10 py-16 text-center">
          <p className="text-4xl" aria-hidden="true">
            🧺
          </p>
          <p className="mt-4 font-heading text-lg font-bold text-forest-700 dark:text-cream-50">
            {t("emptyTitle")}
          </p>
          <p className="mt-2 text-sm text-forest-600/70 dark:text-cream-100/60">
            {t("emptyBody")}
          </p>
          <button
            type="button"
            onClick={onOpenList}
            className="mt-6 rounded-full bg-warm-orange-500 px-6 py-2.5 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600"
          >
            {t("navList")}
          </button>
        </div>
      )}

      {/* Trust row */}
      <Reveal delay={120}>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-t border-cream-200 pt-8 dark:border-white/10">
          {[
            ["🛡️", t("trustVerified")],
            ["⏱️", t("trustWindows")],
            ["🎫", t("trustCodes")],
            ["💚", t("trustFree")],
          ].map(([icon, label]) => (
            <span
              key={label}
              className="flex items-center gap-2 text-sm font-semibold text-forest-600 dark:text-cream-100/70"
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </Reveal>

      {/* My Claims panel */}
      {claimsOpen && (
        <div className="glass-panel animate-fade-in mt-10 p-6">
          <h3 className="font-heading text-lg font-bold text-forest-700 dark:text-cream-50">
            🎫 {t("myClaims")} — {t("trustCodes")}
          </h3>
          <p className="mt-1 text-sm text-forest-600/70 dark:text-cream-100/60">
            {t("reviewPlaceholder")}
          </p>
          <div className="mt-4">
            <MyClaimsPanel refreshKey={refreshKey} />
          </div>
        </div>
      )}
    </section>
  );
}

function Hero({ onOpenList }) {
  const { t } = useSettings();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .getStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="relative flex min-h-[88vh] items-center overflow-hidden">
      {/* Full-bleed banner photo + forest gradient scrim */}
      <img
        src={HERO_IMAGES.spread}
        alt=""
        aria-hidden="true"
        {...{ fetchpriority: "high" }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-forest-700/90 via-forest-600/75 to-forest-700/60" />
      <div
        aria-hidden="true"
        className="animate-float-slow pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-cream-50/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="animate-float-slow pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-warm-orange-500/20 blur-3xl"
        style={{ animationDelay: "1.6s" }}
      />

      <div className="relative mx-auto w-full max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <span className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-cream-50/30 bg-cream-50/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-cream-50 backdrop-blur-sm">
          🌱 {t("heroBadge")}
        </span>
        <h1 className="animate-fade-in-slow mx-auto mt-6 max-w-3xl text-balance font-heading text-4xl font-extrabold leading-tight text-cream-50 drop-shadow-lg sm:text-5xl lg:text-6xl">
          {t("heroTitleA")}{" "}
          <span className="relative text-warm-orange-500">
            {t("heroTitleB")}
            <svg
              aria-hidden="true"
              className="absolute -bottom-2 left-0 h-3 w-full text-warm-orange-500/50"
              viewBox="0 0 200 9"
              preserveAspectRatio="none"
            >
              <path
                d="M2 7C60 2 140 2 198 7"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h1>
        <p
          className="animate-fade-in-slow mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-cream-100/90 sm:text-xl"
          style={{ animationDelay: "0.15s" }}
        >
          {t("heroSub")}
        </p>
        <div
          className="animate-fade-in-slow mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          style={{ animationDelay: "0.3s" }}
        >
          <a
            href="#discover"
            className="w-full rounded-full bg-warm-orange-500 px-8 py-3.5 text-base font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 sm:w-auto"
          >
            {t("heroCta1")}
          </a>
          <button
            type="button"
            onClick={onOpenList}
            className="w-full rounded-full border-2 border-cream-50/40 px-8 py-3.5 text-base font-bold text-cream-50 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cream-50 hover:bg-cream-50/10 sm:w-auto"
          >
            {t("heroCta2")}
          </button>
        </div>

        {/* Impact stats — glass cards over the banner */}
        {stats && (
          <div className="animate-fade-in-slow mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { value: formatNumber(stats.mealsRescued), label: t("mealsRescued") },
              { value: formatNumber(stats.partners), label: t("partners") },
              { value: formatNumber(stats.cities), label: t("cities") },
              { value: Number(stats.co2SavedTons).toFixed(1), label: t("co2Saved") },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-cream-50/25 bg-cream-50/10 px-4 py-5 backdrop-blur-md"
              >
                <p className="font-heading text-2xl font-extrabold text-cream-50">
                  {s.value}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-cream-100/80">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useSettings();
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-cream-100 py-20 dark:bg-night-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold text-forest-700 sm:text-4xl dark:text-cream-50">
            {t("howTitle")}
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 140}>
              <div className="glass-panel h-full p-8 transition-shadow duration-300 hover:shadow-forest-glow">
                <span
                  aria-hidden="true"
                  className="inline-block text-4xl transition-transform duration-300 hover:scale-125 hover:-rotate-12"
                >
                  {step.icon}
                </span>
                <h3 className="mt-5 text-xl font-bold text-forest-600 dark:text-cream-50">
                  {step.title}
                </h3>
                <p className="mt-3 leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutFooter({ onOpenList }) {
  const { t } = useSettings();
  return (
    <>
      <section id="about" className="scroll-mt-24 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-forest-500/25 bg-forest-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-cream-100/80">
                ♻️ {t("navAbout")}
              </span>
              <h2 className="mt-4 text-3xl font-extrabold text-forest-700 sm:text-4xl dark:text-cream-50">
                {t("aboutTitle")}
              </h2>
              <p className="mt-4 leading-relaxed text-forest-700/70 dark:text-cream-100/70">
                One in eight people face food insecurity while roughly a third
                of all food produced is thrown away. FoodRescue exists to close
                that gap — locally, instantly, and with dignity.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal variant="left">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <img
                  src={ABOUT_IMAGES.volunteers}
                  alt="Volunteers packing crates of rescued food for local charities"
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-3xl object-cover shadow-forest-glow"
                />
                <img
                  src={ABOUT_IMAGES.community}
                  alt="Neighbours sharing a community dinner made from rescued ingredients"
                  loading="lazy"
                  className="absolute -bottom-8 -right-4 hidden w-44 rounded-2xl object-cover ring-8 ring-cream-50 sm:block sm:h-32 lg:-right-8 dark:ring-night-200"
                />
                <div className="glass-panel absolute -top-5 -left-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-forest-glow sm:-left-6">
                  <span aria-hidden="true" className="text-xl">
                    🥘
                  </span>
                  <div>
                    <p className="font-heading text-sm font-extrabold text-forest-700 dark:text-cream-50">
                      12,480+ {t("mealsRescued")}
                    </p>
                    <p className="text-xs text-forest-600/70 dark:text-cream-100/60">
                      and counting, every single day
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <h3 className="font-heading text-2xl font-bold text-forest-700 dark:text-cream-50">
                From a bakery's leftover loaves to a neighbour's dinner table
              </h3>
              <p className="mt-4 leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                FoodRescue started with a simple observation: a bakery's
                unsold loaves, a caterer's extra trays, a grocer's
                blemished-but-perfect produce — all perfectly good food,
                destined for the bin, while neighbours line up at food banks
                blocks away.
              </p>
              <p className="mt-3 leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                So we built the missing bridge: a live marketplace where
                surplus becomes someone's meal within hours, not days —
                tracked from pickup to plate, in every city we launch.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  ["✅", "Verified providers and recipients — every account checked"],
                  ["🎫", "4-digit pickup codes keep every handover smooth and accountable"],
                  ["📈", "Impact you can see — meals, partners and CO₂ tracked live"],
                ].map(([icon, text]) => (
                  <li key={text} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-500/10 text-sm"
                    >
                      {icon}
                    </span>
                    <span className="text-sm font-semibold text-forest-700/85 dark:text-cream-100/75">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* idea 16 — food safety & liability / donor protections */}
          <Reveal delay={80} className="mt-16">
            <div
              id="compliance"
              className="glass-panel grid gap-6 rounded-3xl p-8 sm:grid-cols-[auto,1fr] sm:p-10"
            >
              <span aria-hidden="true" className="text-5xl">
                🛡️
              </span>
              <div>
                <h3 className="font-heading text-xl font-bold text-forest-700 dark:text-cream-50">
                  {t("complianceTitle")}
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                  {t("complianceBody")}
                </p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-forest-500/10 px-4 py-1.5 text-xs font-bold text-forest-600 dark:text-cream-100/80">
                  💚 {t("complianceFree")}
                </span>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal variant="scale" className="mt-16">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-forest-600 px-6 py-14 text-center shadow-forest-glow sm:px-12">
            <img
              src={HERO_IMAGES.spread}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-25"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-forest-600/70 via-forest-700/60 to-forest-600/85" />
            <div className="relative">
              <h2 className="text-balance font-heading text-3xl font-extrabold text-cream-50 sm:text-4xl">
                Every plate saved is a small act of climate action
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-cream-100/85 leading-relaxed">
                Food waste drives up to 10% of global greenhouse emissions.
                FoodRescue turns your surplus into measurable community impact —
                free, forever, for charities.
              </p>
              <button
                type="button"
                onClick={onOpenList}
                className="mt-8 rounded-full bg-warm-orange-500 px-8 py-3.5 text-base font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600"
              >
                {t("heroCta2")}
              </button>
            </div>
          </div>
        </Reveal>
      </section>
      <footer className="border-t border-cream-200 bg-cream-100 py-10 dark:border-white/10 dark:bg-night-100">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="font-heading text-lg font-bold text-forest-600 dark:text-cream-50">
            🌱 FoodRescue — Give Good Food Another Chance
          </p>
          <p className="mt-2 text-sm text-forest-700/60 dark:text-cream-100/50">
            © {new Date().getFullYear()} FoodRescue. {t("footerTag")}
          </p>
        </div>
      </footer>
    </>
  );
}

function Shell() {
  const [authOpen, setAuthOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div
      id="top"
      className="min-h-screen bg-cream-50 font-sans text-forest-700 dark:bg-night-200 dark:text-cream-50"
    >
      <Navbar
        onLogin={() => setAuthOpen(true)}
        onListSurplus={() => setListOpen(true)}
        onOpenImpact={() => setImpactOpen(true)}
      />
      <main>
        <Hero onOpenList={() => setListOpen(true)} />
        <Ticker />
        <DiscoverSection
          onOpenList={() => setListOpen(true)}
          refreshSignal={refreshSignal}
        />
        <HowItWorks />
        <AboutFooter onOpenList={() => setListOpen(true)} />
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <ListSurplusModal
        open={listOpen}
        onClose={() => setListOpen(false)}
        onCreated={() => setRefreshSignal((n) => n + 1)}
      />
      <ImpactDashboard open={impactOpen} onClose={() => setImpactOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
