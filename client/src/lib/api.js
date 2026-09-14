/**
 * FoodRescue API client.
 *
 * Talks to the Express backend when reachable (VITE_API_URL, default
 * http://localhost:5001/api). If the server is offline, every call
 * transparently falls back to a local demo dataset + localStorage
 * persistence, so the UI stays fully functional for demos.
 *
 * International demo model: listings carry coordinates across 4 cities,
 * dietary/safety tags, provider ratings and weights (for CO₂ math).
 */

import { CATEGORY_IMAGES, HERO_IMAGES } from "./images";
import { CITIES, haversineKm } from "./geo";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:5001/api";

const LS_LISTINGS = "foodrescue.demo.listings";
const LS_CLAIMS = "foodrescue.demo.claims";
const LS_SESSION = "foodrescue.session";
const LS_ALERTS = "foodrescue.alerts";
const LS_STATS = "foodrescue.demo.stats";
const LS_RATINGS = "foodrescue.demo.ratings";

/* ─── low-level fetch with timeout ─────────────────────────────────── */

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const token =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("foodrescue.token")
        : null;
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ─── demo store (localStorage) ────────────────────────────────────── */

const hr = (n) => new Date(Date.now() + n * 36e5).toISOString();

// Seed listings spread across the four launch cities with dietary tags.
const DEMO_LISTINGS = [
  {
    _id: "demo-1",
    title: "Fresh sourdough loaves (12)",
    category: "Bakery",
    imageUrl: HERO_IMAGES.bread,
    quantity: 12,
    unit: "loaves",
    weightKg: 4.8,
    tags: ["vegetarian"],
    providerName: "Corner Bakehouse",
    cityId: "london",
    location: { type: "Point", coordinates: [-0.1426, 51.5014] },
    rating: 4.8,
    reviewCount: 24,
    urgencyLevel: "expiring_soon",
    status: "available",
    pickupWindow: { start: hr(1), end: hr(5) },
    expiryEstimate: hr(40),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-2",
    title: "Hot meal trays — veggie lasagna",
    category: "Prepared Food",
    imageUrl: HERO_IMAGES.lasagna,
    quantity: 40,
    unit: "portions",
    weightKg: 12,
    tags: ["vegetarian", "keep refrigerated"],
    providerName: "Green Fork Catering",
    cityId: "london",
    location: { type: "Point", coordinates: [-0.1218, 51.5074] },
    rating: 4.9,
    reviewCount: 57,
    urgencyLevel: "urgent",
    status: "available",
    pickupWindow: { start: hr(0.5), end: hr(3) },
    expiryEstimate: hr(72),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-3",
    title: "Organic produce crates",
    category: "Produce",
    imageUrl: CATEGORY_IMAGES["Produce"],
    quantity: 8,
    unit: "crates",
    weightKg: 32,
    tags: ["vegan", "vegetarian", "gluten-free"],
    providerName: "Riverside Market",
    cityId: "nyc",
    location: { type: "Point", coordinates: [-74.0085, 40.7057] },
    rating: 4.7,
    reviewCount: 31,
    urgencyLevel: "normal",
    status: "available",
    pickupWindow: { start: hr(2), end: hr(8) },
    expiryEstimate: hr(72),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-4",
    title: "Yogurt & dairy assortment",
    category: "Dairy",
    imageUrl: CATEGORY_IMAGES["Dairy"],
    quantity: 25,
    unit: "items",
    weightKg: 9,
    tags: ["vegetarian", "keep refrigerated"],
    providerName: "Meadow Dairy Co.",
    cityId: "nyc",
    location: { type: "Point", coordinates: [-73.9942, 40.7135] },
    rating: 4.6,
    reviewCount: 18,
    urgencyLevel: "expiring_soon",
    status: "available",
    pickupWindow: { start: hr(1.5), end: hr(5) },
    expiryEstimate: hr(48),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-5",
    title: "Halal ready-meals — chicken biryani",
    category: "Prepared Food",
    imageUrl: CATEGORY_IMAGES["Prepared Food"],
    quantity: 35,
    unit: "portions",
    weightKg: 14,
    tags: ["halal", "keep refrigerated"],
    providerName: "Karachi Community Kitchen",
    cityId: "karachi",
    location: { type: "Point", coordinates: [67.0099, 24.8428] },
    rating: 5.0,
    reviewCount: 12,
    urgencyLevel: "urgent",
    status: "available",
    pickupWindow: { start: hr(1), end: hr(2.5) },
    expiryEstimate: hr(8),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-6",
    title: "Assorted bagels & spreads",
    category: "Bakery",
    imageUrl: HERO_IMAGES.bagels,
    quantity: 30,
    unit: "pieces",
    weightKg: 6,
    tags: ["vegetarian"],
    providerName: "Corner Bakehouse",
    cityId: "london",
    location: { type: "Point", coordinates: [-0.1419, 51.5019] },
    rating: 4.8,
    reviewCount: 24,
    urgencyLevel: "urgent",
    status: "available",
    pickupWindow: { start: hr(0.5), end: hr(2) },
    expiryEstimate: hr(30),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-7",
    title: "Canned goods & dry staples",
    category: "Packaged Goods",
    imageUrl: CATEGORY_IMAGES["Packaged Goods"],
    quantity: 60,
    unit: "items",
    weightKg: 45,
    tags: ["vegan", "vegetarian", "gluten-free"],
    providerName: "Dubai Food Bank Hub",
    cityId: "dubai",
    location: { type: "Point", coordinates: [55.2708, 25.2048] },
    rating: 4.9,
    reviewCount: 40,
    urgencyLevel: "normal",
    status: "available",
    pickupWindow: { start: hr(2.5), end: hr(12) },
    expiryEstimate: hr(240),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-8",
    title: "Fresh fruit bowls — iftar surplus",
    category: "Prepared Food",
    imageUrl: CATEGORY_IMAGES["Produce"],
    quantity: 50,
    unit: "portions",
    weightKg: 15,
    tags: ["vegan", "vegetarian", "gluten-free", "halal"],
    providerName: "Dubai Iftar Initiative",
    cityId: "dubai",
    location: { type: "Point", coordinates: [55.2925, 25.2356] },
    rating: 4.9,
    reviewCount: 22,
    urgencyLevel: "expiring_soon",
    status: "available",
    pickupWindow: { start: hr(2), end: hr(6) },
    expiryEstimate: hr(12),
    createdAt: new Date().toISOString(),
  },
];

const DEMO_CLAIMS = [
  {
    _id: "demo-claim-1",
    foodListing: "demo-3",
    listingTitle: "Organic produce crates",
    providerName: "Riverside Market",
    status: "reserved",
    pickupCode: "4821",
    claimedAt: new Date(Date.now() - 3.6e6).toISOString(),
    pickedUpAt: null,
  },
];

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — demo state stays in memory only */
  }
}

async function seedDemo() {
  // Re-seed when the stored demo data predates a schema change (e.g. tags)
  const existing = readLS(LS_LISTINGS, null);
  if (!existing || !existing[0]?.tags) writeLS(LS_LISTINGS, DEMO_LISTINGS);
  const existingClaims = readLS(LS_CLAIMS, null);
  if (!existingClaims) writeLS(LS_CLAIMS, DEMO_CLAIMS);
}

/** Wraps a live call with a demo fallback when the server is unreachable. */
async function withFallback(liveFn, demoFn) {
  try {
    return await liveFn();
  } catch (err) {
    const offline =
      err.name === "AbortError" ||
      err.status === 503 || // server up, DB down → demo mode
      err.status === 502 ||
      (err instanceof TypeError && /fetch/i.test(String(err.message)));
    if (!offline) throw err;
    await seedDemo();
    return demoFn();
  }
}

/* ─── demo helpers ─────────────────────────────────────────────────── */

/** Demo distance: haversine from the viewer's city to each listing. */
function withDistances(listings, cityId) {
  const city = CITIES.find((c) => c.id === cityId) || CITIES[0];
  return listings.map((l) => {
    if (l.distanceKm != null) return l;
    const c = l.location?.coordinates;
    if (!c) return l;
    const [lng, lat] = c;
    return {
      ...l,
      distanceKm:
        Math.round(
          haversineKm([city.lat, city.lng], [lat, lng]) * 10
        ) / 10,
    };
  });
}

function bumpStats(patch) {
  const stats = readLS(LS_STATS, {});
  for (const [k, v] of Object.entries(patch)) {
    stats[k] = (stats[k] || 0) + v;
  }
  writeLS(LS_STATS, stats);
}

/** Persisted saved-search alerts (smart notifications). */
export const alerts = {
  all() {
    return readLS(LS_ALERTS, []);
  },
  save(alert) {
    const list = readLS(LS_ALERTS, []);
    const entry = { id: `alert-${Date.now()}`, ...alert };
    writeLS(LS_ALERTS, [entry, ...list].slice(0, 12));
    return entry;
  },
  remove(id) {
    writeLS(
      LS_ALERTS,
      readLS(LS_ALERTS, []).filter((a) => a.id !== id)
    );
  },
  /** Matches a listing against a saved alert's filters. */
  matches(alert, listing) {
    if (alert.cityId && alert.cityId !== "all" && listing.cityId !== alert.cityId)
      return false;
    if (alert.category && alert.category !== "all" && listing.category !== alert.category)
      return false;
    if (alert.urgency && alert.urgency !== "all" && listing.urgencyLevel !== alert.urgency)
      return false;
    if (alert.tag && !listing.tags?.includes(alert.tag)) return false;
    return true;
  },
};

/* ─── public API ───────────────────────────────────────────────────── */

export const api = {
  /** GET /listings — Discover feed with optional filters (+cityId) */
  getListings(filters = {}) {
    return withFallback(
      () => {
        const params = new URLSearchParams(
          Object.entries(filters).filter(([, v]) => v && v !== "all")
        );
        return apiFetch(`/listings?${params}`);
      },
      () => {
        let items = withDistances(readLS(LS_LISTINGS, DEMO_LISTINGS), filters.cityId);
        if (filters.cityId && filters.cityId !== "all") {
          items = items.filter((l) => l.cityId === filters.cityId);
        }
        if (filters.category && filters.category !== "all") {
          items = items.filter((l) => l.category === filters.category);
        }
        if (filters.urgency && filters.urgency !== "all") {
          items = items.filter((l) => l.urgencyLevel === filters.urgency);
        }
        if (filters.tag) {
          items = items.filter((l) => l.tags?.includes(filters.tag));
        }
        if (filters.search) {
          const q = filters.search.toLowerCase();
          items = items.filter(
            (l) =>
              l.title.toLowerCase().includes(q) ||
              (l.providerName || "").toLowerCase().includes(q)
          );
        }
        return { listings: items };
      }
    );
  },

  /** POST /listings — create a surplus listing */
  createListing(payload) {
    return withFallback(
      () => apiFetch("/listings", { method: "POST", body: JSON.stringify(payload) }),
      () => {
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const listing = {
          _id: `demo-${Date.now()}`,
          status: "available",
          urgencyLevel: payload.urgencyLevel || "normal",
          tags: payload.tags || [],
          rating: 5,
          reviewCount: 0,
          cityId: payload.cityId || "london",
          createdAt: new Date().toISOString(),
          ...payload,
        };
        writeLS(LS_LISTINGS, [listing, ...items]);
        return { listing };
      }
    );
  },

  /** POST /claims — reserve a listing */
  createClaim(listingId) {
    return withFallback(
      () => apiFetch("/claims", { method: "POST", body: JSON.stringify({ foodListing: listingId }) }),
      () => {
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const listing = items.find((l) => l._id === listingId);
        if (!listing) throw new Error("Listing not found");
        if (listing.status !== "available") {
          throw new Error("This listing was just claimed by someone else");
        }
        listing.status = "reserved";
        writeLS(LS_LISTINGS, items);
        const claims = readLS(LS_CLAIMS, []);
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const claim = {
          _id: `demo-claim-${Date.now()}`,
          foodListing: listing._id,
          listingTitle: listing.title,
          providerName: listing.providerName || "Local provider",
          status: "reserved",
          pickupCode: code,
          claimedAt: new Date().toISOString(),
          pickedUpAt: null,
        };
        writeLS(LS_CLAIMS, [claim, ...claims]);
        return { claim };
      }
    );
  },

  /** GET /claims/my — current user's claims with pickup codes */
  getMyClaims() {
    return withFallback(
      () => apiFetch("/claims/my"),
      () => ({ claims: readLS(LS_CLAIMS, []) })
    );
  },

  /** GET /listings/provider — provider's own listings with live claim info */
  getProviderListings(scope) {
    return withFallback(
      () => apiFetch(`/listings/provider${scope === "all" ? "?scope=all" : ""}`),
      () => {
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const claims = readLS(LS_CLAIMS, []);
        const byListing = {};
        for (const c of claims) {
          if (c.status === "reserved") {
            (byListing[c.foodListing] = byListing[c.foodListing] || []).push({
              _id: c._id,
              recipientName: c.recipientName || "Recipient",
              pickupCode: c.pickupCode,
              claimedAt: c.claimedAt,
            });
          }
        }
        const wanted = scope === "all" ? null : ["available", "reserved"];
        return {
          listings: items
            .filter((l) => !wanted || wanted.includes(l.status))
            .map((l) => ({ ...l, activeClaims: byListing[l._id] || [] })),
        };
      }
    );
  },

  /** DELETE /listings/:id — provider cancels their own listing */
  cancelListing(listingId) {
    return withFallback(
      () => apiFetch(`/listings/${listingId}`, { method: "DELETE" }),
      () => {
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const listing = items.find((l) => l._id === listingId);
        if (listing) listing.status = "cancelled";
        writeLS(LS_LISTINGS, items);
        return { listing };
      }
    );
  },

  /** PATCH /claims/:id/received — recipient self-confirms a pickup (no-op in demo mode) */
  confirmReceived(claimId) {
    return withFallback(
      () => apiFetch(`/claims/${claimId}/received`, { method: "PATCH", body: "{}" }),
      () => {
        const claims = readLS(LS_CLAIMS, []);
        const claim = claims.find((c) => c._id === claimId);
        if (!claim || claim.status !== "reserved") {
          throw new Error("Claim is not reserved (already picked up or cancelled)");
        }
        claim.status = "picked_up";
        claim.pickedUpAt = new Date().toISOString();
        writeLS(LS_CLAIMS, claims);
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const listing = items.find((l) => l._id === claim.foodListing);
        if (listing) listing.status = "completed";
        writeLS(LS_LISTINGS, items);
        bumpStats({
          mealsRescued: Number(listing?.quantity) || 1,
          co2SavedTons: (Number(listing?.weightKg) || 2.5) * 0.0025,
        });
        return { claim };
      }
    );
  },

  /** PATCH /claims/:id/cancel — recipient releases a reservation */
  cancelClaim(claimId) {
    return withFallback(
      () => apiFetch(`/claims/${claimId}/cancel`, { method: "PATCH", body: "{}" }),
      () => {
        const claims = readLS(LS_CLAIMS, []);
        const claim = claims.find((c) => c._id === claimId);
        if (!claim || claim.status !== "reserved") {
          throw new Error("Reserved claim not found");
        }
        claim.status = "cancelled";
        writeLS(LS_CLAIMS, claims);
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const listing = items.find((l) => l._id === claim.foodListing);
        if (listing) listing.status = "available";
        writeLS(LS_LISTINGS, items);
        return { claim };
      }
    );
  },

  /** PATCH /claims/:id/pickup — confirm handover with the 4-digit code */
  confirmPickup(claimId, code) {
    return withFallback(
      () =>
        apiFetch(`/claims/${claimId}/pickup`, {
          method: "PATCH",
          body: JSON.stringify({ pickupCode: code }),
        }),
      () => {
        const claims = readLS(LS_CLAIMS, []);
        const claim = claims.find((c) => c._id === claimId);
        if (!claim) throw new Error("Claim not found");
        if (claim.pickupCode !== code) throw new Error("Incorrect pickup code");
        claim.status = "picked_up";
        claim.pickedUpAt = new Date().toISOString();
        writeLS(LS_CLAIMS, claims);
        // Completed rescue → impact stats grow (weight → CO₂ math)
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const listing = items.find((l) => l._id === claim.foodListing);
        bumpStats({
          mealsRescued: Number(listing?.quantity) || 1,
          co2SavedTons: (Number(listing?.weightKg) || 2.5) * 0.0025,
        });
        return { claim };
      }
    );
  },

  /** POST /claims/:id/review — rate a completed pickup (idea 9) */
  reviewClaim(claimId, rating, comment = "") {
    return withFallback(
      () =>
        apiFetch(`/claims/${claimId}/review`, {
          method: "POST",
          body: JSON.stringify({ rating, comment }),
        }),
      () => {
        const claims = readLS(LS_CLAIMS, []);
        const claim = claims.find((c) => c._id === claimId);
        if (!claim) throw new Error("Claim not found");
        claim.rating = rating;
        claim.review = comment;
        claim.reviewedAt = new Date().toISOString();
        writeLS(LS_CLAIMS, claims);
        // Nudge the provider's rolling rating in the demo store
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const listing = items.find((l) => l._id === claim.foodListing);
        if (listing) {
          const count = (listing.reviewCount || 0) + 1;
          const avg = ((listing.rating || 5) * (count - 1) + rating) / count;
          listing.reviewCount = count;
          listing.rating = Math.round(avg * 10) / 10;
          writeLS(LS_LISTINGS, items);
        }
        return { claim };
      }
    );
  },

  /** POST /auth/login — returns { token, user } */
  login(email, password) {
    return withFallback(
      async () => {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        // Persist the JWT here — the api client owns its storage keys, so
        // sessions survive reloads no matter which caller logs in.
        if (data?.token) {
          try { localStorage.setItem("foodrescue.token", data.token); } catch { /* ignore */ }
        }
        return data;
      },
      () => {
        // Demo auth: any email/password combination is accepted offline.
        const user = {
          name: email.split("@")[0].replace(/[._]/g, " "),
          email,
          role: email.startsWith("provider") ? "provider" : "recipient",
          country: "GB",
        };
        const token = `demo.${btoa(email)}.token`;
        localStorage.setItem("foodrescue.token", token);
        localStorage.setItem(LS_SESSION, JSON.stringify(user));
        return { token, user, demo: true };
      }
    );
  },

  /** POST /auth/register */
  register(payload) {
    return withFallback(
      async () => {
        const data = await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (data?.token) {
          try { localStorage.setItem("foodrescue.token", data.token); } catch { /* ignore */ }
        }
        return data;
      },
      () => {
        const user = {
          name: payload.name,
          email: payload.email,
          role: payload.role || "recipient",
          country: payload.country || null,
        };
        const token = `demo.${btoa(payload.email)}.token`;
        localStorage.setItem("foodrescue.token", token);
        localStorage.setItem(LS_SESSION, JSON.stringify(user));
        return { token, user, demo: true };
      }
    );
  },

  /** GET /auth/me — restore session */
  me() {
    return withFallback(
      () => apiFetch("/auth/me"),
      () => {
        const user = readLS(LS_SESSION, null);
        if (!user) throw new Error("No session");
        return { user };
      }
    );
  },

  logout() {
    localStorage.removeItem("foodrescue.token");
    localStorage.removeItem(LS_SESSION);
  },

  /**
   * POST /ai/classify — Groq-powered food classification (category, shelf
   * life, urgency, summary). Falls back to the local keyword heuristic in
   * demo mode; callers should also handle 401 (anonymous) themselves.
   */
  classifyFood(description) {
    return withFallback(
      () =>
        apiFetch("/ai/classify", {
          method: "POST",
          body: JSON.stringify({ description }),
        }),
      () => ({ classification: null }) // demo mode: caller uses local heuristic
    );
  },

  /** GET /stats — public impact counters */
  getStats() {
    return withFallback(
      () => apiFetch("/stats"),
      () => {
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const claims = readLS(LS_CLAIMS, []);
        const bonus = readLS(LS_STATS, {});
        const portions = items.reduce(
          (sum, l) => sum + (Number(l.quantity) || 0),
          60 + claims.filter((c) => c.status === "picked_up").length * 12
        );
        // Leaderboard (demo): top providers by "rescued" quantity
        const byProvider = {};
        for (const l of items) {
          const name = l.providerName || "Local provider";
          byProvider[name] = byProvider[name] || { meals: 0, kg: 0, rescues: 0 };
          byProvider[name].meals += Number(l.quantity) || 0;
          byProvider[name].kg += Number(l.weightKg) || 0;
          byProvider[name].rescues += 1;
        }
        const BADGES = [
          { min: 25, label: "🥇 Top Contributor" },
          { min: 10, label: "🏅 Food Saver" },
          { min: 1, label: "🌱 Waste Reducer" },
        ];
        const leaderboard = Object.entries(byProvider)
          .sort((a, b) => b[1].meals - a[1].meals)
          .slice(0, 8)
          .map(([name, s], i) => ({
            rank: i + 1,
            name,
            meals: s.meals,
            kg: Math.round(s.kg * 10) / 10,
            rescues: s.rescues,
            badge: (BADGES.find((b) => s.meals >= b.min) || BADGES[2]).label,
          }));

        // Monthly trend (demo): the launch growth curve, live stacked on top
        const DIST = [0.1, 0.12, 0.15, 0.18, 0.2, 0.25];
        const KG_PER_MEAL = 0.59;
        const monthly = DIST.map((share, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - i));
          const meals = Math.round((12480 + portions) * share);
          return {
            month: d.toISOString().slice(0, 7),
            label: d.toLocaleString("en", { month: "short" }),
            meals,
            kg: Math.round(meals * KG_PER_MEAL * 10) / 10,
          };
        });

        return {
          mealsRescued: 12480 + portions + (bonus.mealsRescued || 0),
          partners: 96,
          cities: CITIES.length,
          co2SavedTons:
            Math.round((18.4 + (bonus.co2SavedTons || 0)) * 10) / 10,
          listingsAvailable: items.filter((l) => l.status === "available")
            .length,
          kgDiverted:
            Math.round(
              ((18.4 * 1000) / 2.5 +
                items.reduce((s, l) => s + (Number(l.weightKg) || 0), 0)) *
                10
            ) / 10,
          leaderboard,
          monthly,
        };
      }
    );
  },

  /**
   * Live feed (idea 6). Uses Socket.io against the real server; falls back
   * to light polling in demo mode so the UI still feels alive. Returns a
   * disconnect function.
   */
  subscribeFeed({ onUpdate, onError, onCreated, onClaimed }) {
    let dispose = () => {};
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        // Derive ws origin from API_BASE (http://localhost:5001/api → :5001)
        const wsOrigin = API_BASE.replace(/\/api\/?$/, "");
        // Real JWTs authenticate the socket into the user's private room so
        // targeted events (listing:created / listing:claimed) arrive; demo
        // tokens are skipped — the server would just reject them.
        const token = localStorage.getItem("foodrescue.token");
        const socket = io(wsOrigin, {
          transports: ["websocket"],
          timeout: 4000,
          auth: token && !token.startsWith("demo.") ? { token } : undefined,
        });
        let connected = false;
        socket.on("connect", () => {
          connected = true;
        });
        socket.on("listings:update", (payload) => onUpdate?.(payload));
        // Private-room notifications (see server/services/socket.js)
        socket.on("listing:created", (payload) => onCreated?.(payload));
        socket.on("listing:claimed", (payload) => onClaimed?.(payload));
        socket.on("connect_error", () => {
          if (!connected) startPolling();
        });
        dispose = () => socket.close();
      } catch {
        startPolling();
      }
    })();

    function startPolling() {
      let stop = false;
      const tick = async () => {
        if (stop) return;
        try {
          const { listings } = await api.getListings({});
          onUpdate?.({ source: "poll", listings });
        } catch (err) {
          onError?.(err);
        }
        if (!stop) setTimeout(tick, 15000);
      };
      tick();
      dispose = () => {
        stop = true;
      };
    }

    return () => dispose();
  },
};

export default api;
