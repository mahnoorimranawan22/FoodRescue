import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SurplusCard from "../components/SurplusCard";
import ClaimModal from "../components/ClaimModal";
import MyClaimsPanel from "../components/MyClaimsPanel";
import Reveal from "../components/Reveal";
import api, { alerts as alertStore } from "../lib/api";
import { CITIES, cityById, distanceTo, getPositionCached } from "../lib/geo";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../components/Toast";

const FILTERS = [
  { key: "all", label: "filterAll", emoji: "🌍" },
  { key: "Prepared Food", label: "filterPrepared", emoji: "🍲" },
  { key: "Bakery", label: "filterBakery", emoji: "🥖" },
  { key: "Produce", label: "filterProduce", emoji: "🥕" },
  { key: "Dairy", label: "filterDairy", emoji: "🧀" },
  { key: "Packaged Goods", label: "filterPackaged", emoji: "🥫" },
];

const TAG_FILTERS = ["vegetarian", "vegan", "halal", "kosher", "gluten-free"];

/** Radius options in km — null means "any distance". */
const RADII = [null, 2, 5, 10];

const CATEGORY_PIN = {
  "Prepared Food": "🍲",
  Bakery: "🥖",
  Produce: "🥕",
  Dairy: "🧀",
  "Packaged Goods": "🥫",
};

/* Keeps the map centered on the active reference point (me / city). */
function AutoRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.8 });
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function pinIcon(listing) {
  const emoji = CATEGORY_PIN[listing.category] || "🍽️";
  const urgent = listing.urgencyLevel === "urgent";
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;font-size:19px;background:${
      urgent ? "#E06D3B" : "#2D5A27"
    };border:2.5px solid #FAF8F5;border-radius:9999px;box-shadow:0 4px 10px rgba(20,43,18,.4)">${emoji}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

/**
 * Discover page — the surplus food discovery interface.
 * Radius filter (2/5/10 km), category tabs, search + urgency + dietary tags,
 * city chips, live feed, and a List ⇄ Map toggle where the react-leaflet map
 * sits alongside the SurplusCard grid.
 */
export default function Discover({ onOpenList, refreshSignal }) {
  const toast = useToast();
  const { t, city: settingsCity, units, tz } = useSettings();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [tag, setTag] = useState("all");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState(settingsCity?.id || "london");
  const [radiusKm, setRadiusKm] = useState(null);
  const [view, setView] = useState("list");
  const [geoPos, setGeoPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [live, setLive] = useState(false);
  const [savedAlerts, setSavedAlerts] = useState([]);
  const [claimListing, setClaimListing] = useState(null);
  const knownIds = useRef(new Set());

  const refreshAlerts = useCallback(() => setSavedAlerts(alertStore.all()), []);
  useEffect(refreshAlerts, [refreshAlerts]);

  /* Silent refresh used by the live feed (no skeleton flash) */
  const silentFetch = useCallback(() => {
    api
      .getListings({ category, urgency, search, tag, cityId: cityFilter })
      .then((data) => {
        const next = data.listings || [];
        // smart alerts: check the incoming batch against saved filters
        for (const listing of next) {
          if (knownIds.current.has(listing._id)) continue;
          knownIds.current.add(listing._id);
          const hit = alertStore.all().find((a) => alertStore.matches(a, listing));
          if (hit) toast(`🔔 ${listing.title} — ${t("alertSaved")}`, "info");
        }
        setListings(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, urgency, search, tag, cityFilter]);

  /* Live feed: Socket.io on the real server, polling in demo mode */
  useEffect(() => {
    const dispose = api.subscribeFeed({
      onUpdate: () => {
        setLive(true);
        silentFetch();
      },
      onCreated: (p) => {
        setLive(true);
        toast(`🌱 ${p.title} nearby — ${p.distanceKm} km away`, "info");
      },
      onClaimed: (p) => {
        toast(`🙌 ${p.recipientName} reserved "${p.listingTitle}" — code ${p.pickupCode}`, "success");
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

  /* Distances from the viewer when located, else server-provided (city centre) */
  const located = useMemo(() => {
    if (!geoPos) return listings;
    return listings
      .map((l) => ({ ...l, distanceKm: distanceTo(l, geoPos) }))
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  }, [listings, geoPos]);

  /* Radius filter applies against the current distances */
  const shown = useMemo(
    () =>
      radiusKm
        ? located.filter((l) => (l.distanceKm ?? Infinity) <= radiusKm)
        : located,
    [located, radiusKm]
  );

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

  const hasActiveFilters =
    category !== "all" || urgency !== "all" || tag !== "all" || !!search || !!radiusKm;

  const saveCurrentAlert = () => {
    alertStore.save({ category, urgency, tag, search, cityId: cityFilter });
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

  const city = cityById(cityFilter);
  const mapCenter = geoPos
    ? { lat: geoPos.lat, lng: geoPos.lng }
    : city
      ? { lat: city.lat, lng: city.lng }
      : { lat: 51.5074, lng: -0.1278 };

  const fmtTime = (iso) =>
    iso
      ? new Date(iso).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: tz || undefined,
        })
      : "";

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
                  {shown.length}
                </span>{" "}
                {t("listingsAvailable", { n: shown.length }).replace(/^\S+\s*/, "")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* List / Map toggle */}
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

      {/* City chips */}
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

      {/* Category tabs + urgency + search */}
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

        {/* Radius filter (2 / 5 / 10 km) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600/50 dark:text-cream-100/40">
            📡 {t("radius")}:
          </span>
          {RADII.map((r) => (
            <button
              key={r ?? "any"}
              type="button"
              onClick={() => setRadiusKm(r)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                radiusKm === r
                  ? "bg-warm-orange-500 text-white shadow-orange-glow"
                  : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-warm-orange-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
              }`}
            >
              {r === null ? t("radiusAll") : `${r} ${t("kmUnit")}`}
            </button>
          ))}
          {radiusKm && !geoPos && (
            <button
              type="button"
              onClick={locateMe}
              className="text-xs font-semibold text-warm-orange-600 underline decoration-dotted underline-offset-2"
            >
              {t("locatingNote")}
            </button>
          )}
        </div>

        {/* Dietary tag filters */}
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

        {/* Saved alerts */}
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
              🔔{" "}
              {[a.category, a.urgency, a.tag].filter((x) => x && x !== "all").join(" · ") ||
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
      {!loading && spotlight && category === "all" && urgency === "all" && !search && (
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
            <span aria-hidden="true" className="text-2xl">⚠️</span>
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

      {/* Content: grid, or map alongside the card grid */}
      {loading ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel h-96 animate-pulse-soft"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      ) : view === "map" ? (
        <div className="mt-10 grid gap-6 lg:grid-cols-[3fr,2fr]">
          <div className="relative">
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={12}
              scrollWheelZoom={false}
              className="z-0 h-[440px] overflow-hidden rounded-3xl ring-1 ring-cream-200 dark:ring-white/10"
              role="application"
              aria-label={t("viewMap")}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
              <AutoRecenter center={mapCenter} />
              {radiusKm && (
                <Circle
                  center={[mapCenter.lat, mapCenter.lng]}
                  radius={radiusKm * 1000}
                  pathOptions={{
                    color: "#E06D3B",
                    weight: 1.5,
                    fillColor: "#E06D3B",
                    fillOpacity: 0.06,
                    dashArray: "6 6",
                  }}
                />
              )}
              {shown
                .filter((l) => l.location?.coordinates?.length === 2)
                .map((l) => {
                  const [lng, lat] = l.location.coordinates;
                  return (
                    <Marker key={l._id} position={[lat, lng]} icon={pinIcon(l)}>
                      <Popup>
                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: "#142B12" }}>
                            {l.title}
                          </div>
                          {l.distanceKm != null && (
                            <div style={{ fontSize: 11, color: "#2D5A27", fontWeight: 700, margin: "4px 0" }}>
                              📍 {l.distanceKm.toFixed(1)} {units === "imperial" ? "mi" : "km"}
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: "#1E3F1A" }}>
                            🕒 {fmtTime(l.pickupWindow?.start)}–{fmtTime(l.pickupWindow?.end)} ·{" "}
                            {l.quantity} {l.unit || ""}
                          </div>
                          <div style={{ fontSize: 11, color: "#1E3F1A", opacity: 0.75, marginTop: 2 }}>
                            {l.providerName || ""}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
            </MapContainer>
          </div>

          {/* Cards alongside the map — scrollable column */}
          <div className="max-h-[440px] space-y-4 overflow-y-auto pr-1">
            {shown.map((listing) => (
              <SurplusCard key={listing._id} listing={listing} onRescue={setClaimListing} />
            ))}
            {shown.length === 0 && (
              <div className="glass-panel p-8 text-center text-sm text-forest-600/70 dark:text-cream-100/60">
                {t("emptyTitle")}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((listing, i) => (
            <Reveal key={listing._id} variant="scale" delay={Math.min(i, 5) * 70}>
              <SurplusCard listing={listing} onRescue={setClaimListing} />
            </Reveal>
          ))}
        </div>
      )}

      {!loading && view === "list" && shown.length === 0 && (
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

      {/* Claim modal (opened by every SurplusCard's Rescue Food button) */}
      {claimListing && (
        <ClaimModal
          listing={claimListing}
          onClose={() => setClaimListing(null)}
          onClaimed={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </section>
  );
}
