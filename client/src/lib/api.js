/**
 * FoodRescue API client.
 *
 * Talks to the Express backend when reachable (VITE_API_URL, default
 * http://localhost:5001/api). If the server is offline, every call
 * transparently falls back to a local demo dataset + localStorage
 * persistence, so the UI stays fully functional for demos.
 */

import { CATEGORY_IMAGES, HERO_IMAGES } from "./images";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:5001/api";

const LS_LISTINGS = "foodrescue.demo.listings";
const LS_CLAIMS = "foodrescue.demo.claims";
const LS_SESSION = "foodrescue.session";

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

const DEMO_LISTINGS = [
  {
    _id: "demo-1",
    title: "Fresh sourdough loaves (12)",
    category: "Bakery",
    imageUrl: HERO_IMAGES.bread,
    quantity: 12,
    unit: "loaves",
    providerName: "Corner Bakehouse",
    distanceKm: 0.8,
    urgencyLevel: "expiring_soon",
    status: "available",
    pickupWindow: {
      start: new Date(Date.now() + 36e5).toISOString(),
      end: new Date(Date.now() + 9e6).toISOString(),
    },
    expiryEstimate: new Date(Date.now() + 1.4e8).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-2",
    title: "Hot meal trays — veggie lasagna",
    category: "Prepared Food",
    imageUrl: HERO_IMAGES.lasagna,
    quantity: 40,
    unit: "portions",
    providerName: "Green Fork Catering",
    distanceKm: 1.6,
    urgencyLevel: "urgent",
    status: "available",
    pickupWindow: {
      start: new Date(Date.now() + 18e5).toISOString(),
      end: new Date(Date.now() + 10.8e6).toISOString(),
    },
    expiryEstimate: new Date(Date.now() + 2.6e8).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-3",
    title: "Organic produce crates",
    category: "Produce",
    imageUrl: CATEGORY_IMAGES["Produce"],
    quantity: 8,
    unit: "crates",
    providerName: "Riverside Market",
    distanceKm: 2.4,
    urgencyLevel: "normal",
    status: "available",
    pickupWindow: {
      start: new Date(Date.now() + 72e5).toISOString(),
      end: new Date(Date.now() + 2.6e7).toISOString(),
    },
    expiryEstimate: new Date(Date.now() + 2.6e8).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-4",
    title: "Yogurt & dairy assortment",
    category: "Dairy",
    imageUrl: CATEGORY_IMAGES["Dairy"],
    quantity: 25,
    unit: "items",
    providerName: "Meadow Dairy Co.",
    distanceKm: 3.1,
    urgencyLevel: "expiring_soon",
    status: "available",
    pickupWindow: {
      start: new Date(Date.now() + 54e5).toISOString(),
      end: new Date(Date.now() + 1.8e7).toISOString(),
    },
    expiryEstimate: new Date(Date.now() + 1.7e8).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-5",
    title: "Canned goods & dry staples",
    category: "Packaged Goods",
    imageUrl: CATEGORY_IMAGES["Packaged Goods"],
    quantity: 60,
    unit: "items",
    providerName: "Harvest Pantry",
    distanceKm: 4.2,
    urgencyLevel: "normal",
    status: "available",
    pickupWindow: {
      start: new Date(Date.now() + 9e6).toISOString(),
      end: new Date(Date.now() + 4.3e7).toISOString(),
    },
    expiryEstimate: new Date(Date.now() + 8.6e9).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    _id: "demo-6",
    title: "Assorted bagels & spreads",
    category: "Bakery",
    imageUrl: HERO_IMAGES.bagels,
    quantity: 30,
    unit: "pieces",
    providerName: "Corner Bakehouse",
    distanceKm: 0.9,
    urgencyLevel: "urgent",
    status: "available",
    pickupWindow: {
      start: new Date(Date.now() + 18e5).toISOString(),
      end: new Date(Date.now() + 7.2e6).toISOString(),
    },
    expiryEstimate: new Date(Date.now() + 1.1e8).toISOString(),
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
  const existing = readLS(LS_LISTINGS, null);
  if (!existing) writeLS(LS_LISTINGS, DEMO_LISTINGS);
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

/* ─── public API ───────────────────────────────────────────────────── */

export const api = {
  /** GET /listings — Discover feed with optional filters */
  getListings(filters = {}) {
    return withFallback(
      () => {
        const params = new URLSearchParams(
          Object.entries(filters).filter(([, v]) => v && v !== "all")
        );
        return apiFetch(`/listings?${params}`);
      },
      () => {
        let items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        if (filters.category && filters.category !== "all") {
          items = items.filter((l) => l.category === filters.category);
        }
        if (filters.urgency && filters.urgency !== "all") {
          items = items.filter((l) => l.urgencyLevel === filters.urgency);
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
        return { claim };
      }
    );
  },

  /** POST /auth/login — returns { token, user } */
  login(email, password) {
    return withFallback(
      () =>
        apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      () => {
        // Demo auth: any email/password combination is accepted offline.
        const user = {
          name: email.split("@")[0].replace(/[._]/g, " "),
          email,
          role: email.startsWith("provider") ? "provider" : "recipient",
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
      () =>
        apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      () => {
        const user = {
          name: payload.name,
          email: payload.email,
          role: payload.role || "recipient",
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

  /** GET /stats — public impact counters */
  getStats() {
    return withFallback(
      () => apiFetch("/stats"),
      () => {
        const items = readLS(LS_LISTINGS, DEMO_LISTINGS);
        const claims = readLS(LS_CLAIMS, []);
        const portions = items.reduce(
          (sum, l) => sum + (Number(l.quantity) || 0),
          60 + claims.filter((c) => c.status === "picked_up").length * 12
        );
        return {
          mealsRescued: 12480 + portions,
          partners: 96,
          cities: 4,
          co2SavedTons: 18.4,
        };
      }
    );
  },
};

export default api;
