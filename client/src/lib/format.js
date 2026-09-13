/**
 * FoodRescue — international formatting helpers (zero dependencies).
 *
 * Everything here renders in the *user's selected* timezone/units via the
 * Intl APIs, so a pickup window stored in UTC reads "14:00–18:00" for a
 * Londoner and "15:00–19:00" for a Berliner — the core of timezone-correct
 * pickup windows across countries.
 */

/**
 * Format an ISO timestamp as an HH:mm clock time in the given IANA timezone.
 * Falls back to the viewer's local timezone when tz is falsy.
 */
export function formatTime(iso, tz) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

/** Format a date + time (e.g. "12 Sep, 14:00") in the given timezone. */
export function formatDateTime(iso, tz) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** "14:00–18:00 your time" pickup window in the given timezone. */
export function formatWindow(win, tz) {
  if (!win?.start || !win?.end) return "";
  return `${formatTime(win.start, tz)}–${formatTime(win.end, tz)}`;
}

/** Localized compact number: 12480 → "12,480" (or "12.480" in es/DE locales). */
export function formatNumber(value, options = {}) {
  if (value == null || Number.isNaN(Number(value))) return "0";
  return new Intl.NumberFormat(undefined, options).format(Number(value));
}

/** Big impact numbers with SI suffix: 12480 → "12.5k", 1840000 → "1.8M". */
export function formatCompact(value) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

/* ─── unit conversion (user preference aware) ───────────────────────── */

export function kmToDisplay(km, units) {
  const n = Number(km) || 0;
  return units === "imperial" ? n * 0.621371 : n;
}

/** "0.8 km" / "0.5 mi" — used on cards and map popups. */
export function formatDistance(km, units = "metric") {
  const n = kmToDisplay(km, units);
  const unitLabel = units === "imperial" ? "mi" : "km";
  const digits = n < 10 ? 1 : 0;
  return `${n.toFixed(digits)} ${unitLabel}`;
}

/** Weight: stored in kg → "12.5 kg" or "27.6 lb". */
export function formatWeight(kg, units = "metric") {
  const n = Number(kg) || 0;
  return units === "imperial"
    ? `${(n * 2.20462).toFixed(1)} lb`
    : `${n.toFixed(1)} kg`;
}

/** Temperature: stored °C → "4°C" or "39°F". */
export function formatTemp(c, units = "metric") {
  const n = Number(c) || 0;
  return units === "imperial"
    ? `${Math.round(n * 1.8 + 32)}°F`
    : `${Math.round(n)}°C`;
}

/* ─── countdowns ────────────────────────────────────────────────────── */

/** Live countdown segments until iso: {h, m, s, totalMs}. */
export function countdown(iso, now = Date.now()) {
  const totalMs = Math.max(0, new Date(iso).getTime() - now);
  return {
    totalMs,
    h: Math.floor(totalMs / 36e5),
    m: Math.floor((totalMs % 36e5) / 6e4),
    s: Math.floor((totalMs % 6e4) / 1000),
  };
}

/** Short label: "2h 14m left" / "under 1h left" / "window closed". */
export function timeLeftLabel(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "window closed";
  const { h, m } = countdown(iso, now);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h >= 1) return `${h}h ${m}m left`;
  return `under ${Math.max(1, m)}m left`;
}

/**
 * Pickup window in the viewer's timezone + local day label, e.g.
 * "Today 14:00–18:00" / "Tomorrow 09:00–12:00" / "Sat 14:00–18:00".
 */
export function friendlyWindow(win, tz) {
  if (!win?.start || !win?.end) return "";
  const start = new Date(win.start);
  const today = start.toDateString() === new Date().toDateString();
  const tomorrow =
    start.toDateString() ===
    new Date(Date.now() + 864e5).toDateString();
  const clock = formatWindow(win, tz);
  if (today) return `Today ${clock}`;
  if (tomorrow) return `Tomorrow ${clock}`;
  try {
    const day = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      timeZone: tz || undefined,
    }).format(start);
    return `${day} ${clock}`;
  } catch {
    return clock;
  }
}

/** "expires in 2h" style label for expiry estimate. */
export function expiryLabel(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "expired";
  const { h, m } = countdown(iso, now);
  if (h >= 24) return `expires in ${Math.floor(h / 24)}d`;
  if (h >= 1) return `expires in ${h}h`;
  return `expires in ${m}m`;
}
