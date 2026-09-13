/**
 * FoodRescue — geo helpers (zero dependencies).
 * Pure haversine math so demo mode gets the same distance math as the
 * server's $geoNear pipeline, plus light coordinate caching for geolocation.
 */

/** Great-circle distance between two [lat,lng] points, in kilometres. */
export function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Distance from the viewer (lat/lng) to a listing. Listings store GeoJSON
 * [lng, lat]; the server sends distanceKm when geo-located, otherwise we
 * compute it locally so every card can show a distance badge.
 */
export function distanceTo(listing, viewer) {
  if (!viewer) return listing?.distanceKm ?? null;
  const c = listing?.location?.coordinates;
  if (!c || c.length !== 2) return null;
  const [lng, lat] = c;
  return haversineKm([viewer.lat, viewer.lng], [lat, lng]);
}

/** navigator.geolocation as a promise, with a hard timeout. */
export function getPosition(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || "Location denied")),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 }
    );
  });
}

/** Cache the user's position for the session (avoid repeated prompts). */
let cachedPosition = null;
export async function getPositionCached() {
  if (cachedPosition) return cachedPosition;
  cachedPosition = await getPosition();
  return cachedPosition;
}

/** Cities the network is live in — drives the city picker + map default. */
export const CITIES = [
  { id: "london", label: "London", country: "UK", flag: "🇬🇧", lat: 51.5074, lng: -0.1278, tz: "Europe/London" },
  { id: "nyc", label: "New York", country: "USA", flag: "🇺🇸", lat: 40.7128, lng: -74.006, tz: "America/New_York" },
  { id: "karachi", label: "Karachi", country: "Pakistan", flag: "🇵🇰", lat: 24.8607, lng: 67.0011, tz: "Asia/Karachi" },
  { id: "dubai", label: "Dubai", country: "UAE", flag: "🇦🇪", lat: 25.2048, lng: 55.2708, tz: "Asia/Dubai" },
];

export function cityById(id) {
  return CITIES.find((c) => c.id === id) || null;
}
