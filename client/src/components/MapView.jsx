import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useSettings } from "../context/SettingsContext";
import { formatDistance, formatTime } from "../lib/format";

const CATEGORY_PIN = {
  "Prepared Food": "🍲",
  Bakery: "🥖",
  Produce: "🥕",
  Dairy: "🧀",
  "Packaged Goods": "🥫",
};

/**
 * Idea 1 — Map view for Discover. Leaflet with OpenStreetMap tiles (no API
 * key needed). Listings become emoji pins; popups show photo + claim info.
 * Dark mode dims tiles via CSS filter (index.css .dark .leaflet-tile).
 */
export default function MapView({ listings, center, height = 440 }) {
  const { units, tz, t } = useSettings();
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const centerFallback = useMemo(
    () => ({ lat: 51.5074, lng: -0.1278 }),
    []
  );

  useEffect(() => {
    if (mapRef.current) return;
    const c = center || centerFallback;
    const map = L.map(elRef.current, {
      center: [c.lat, c.lng],
      zoom: 12,
      scrollWheelZoom: false, // don't hijack page scroll
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers when listings or center change
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const pts = [];
    if (center) pts.push([center.lat, center.lng]);
    for (const listing of listings) {
      const c = listing.location?.coordinates;
      if (!c || c.length !== 2) continue;
      const [lng, lat] = c;
      pts.push([lat, lng]);
      const emoji = CATEGORY_PIN[listing.category] || "🍽️";
      const urgent = listing.urgencyLevel === "urgent";
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;font-size:19px;background:${
          urgent ? "#E06D3B" : "#2D5A27"
        };border:2.5px solid #FAF8F5;border-radius:9999px;box-shadow:0 4px 10px rgba(20,43,18,.4)">${emoji}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18],
      });
      const photo = listing.imageUrl
        ? `<img src="${listing.imageUrl}" alt="" style="width:100%;height:96px;object-fit:cover;border-radius:8px;margin-bottom:6px" onerror="this.style.display='none'"/>`
        : "";
      const dist =
        listing.distanceKm != null
          ? `<div style="font-size:11px;color:#2D5A27;font-weight:700;margin-bottom:4px">📍 ${formatDistance(
              listing.distanceKm, units
            )}</div>`
          : "";
      L.marker([lat, lng], { icon })
        .bindPopup(
          `<div style="min-width:180px;font-family:inherit">${photo}
            <div style="font-weight:800;font-size:13px;color:#142B12">${listing.title}</div>
            ${dist}
            <div style="font-size:12px;color:#1E3F1A">🕒 ${formatTime(
              listing.pickupWindow?.start, tz
            )}–${formatTime(listing.pickupWindow?.end, tz)} · ${
            listing.quantity
          } ${listing.unit || ""}</div>
            <div style="font-size:11px;color:#1E3F1A;opacity:.75;margin-top:2px">${
              listing.providerName || ""
            }</div>
          </div>`
        )
        .addTo(layer);
    }

    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: true });
    }
  }, [listings, center, units, tz]);

  return (
    <div
      ref={elRef}
      style={{ height }}
      className="z-0 overflow-hidden rounded-3xl ring-1 ring-cream-200 dark:ring-white/10"
      role="application"
      aria-label={t("viewMap")}
    />
  );
}
