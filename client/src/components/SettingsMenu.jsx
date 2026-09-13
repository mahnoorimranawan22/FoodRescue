import { useEffect, useRef, useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { LANGUAGES } from "../lib/i18n";
import { CITIES } from "../lib/geo";

/**
 * idea 3 + 11 + 12 + 13 — the international control center: language
 * (with RTL Arabic), units (km/mi etc.), timezone override, city context,
 * and the dark-mode toggle lives right beside it in the navbar.
 */
export default function SettingsMenu({ onToggleTheme, theme }) {
  const { t, lang, setLanguage, units, setUnits, timezone, setTimezone, cityId, setCity } =
    useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selectCls =
    "w-full rounded-xl border border-cream-200 bg-white px-3 py-2 text-sm text-forest-700 focus:border-warm-orange-500 focus:outline-none dark:border-white/10 dark:bg-night-100 dark:text-cream-50";
  const labelCls =
    "mb-1 block text-[11px] font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60";

  const commonTimezones = [
    { value: "", label: t("timezoneAuto") },
    { value: "Europe/London", label: "London (GMT/BST)" },
    { value: "America/New_York", label: "New York (ET)" },
    { value: "Asia/Karachi", label: "Karachi (PKT)" },
    { value: "Asia/Dubai", label: "Dubai (GST)" },
    { value: "Europe/Paris", label: "Paris (CET)" },
    { value: "Asia/Tokyo", label: "Tokyo (JST)" },
    { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("settings")}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-forest-600 transition-colors hover:bg-forest-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 dark:text-cream-100"
      >
        <span aria-hidden="true">🌐</span>
        <span className="hidden text-xs font-bold uppercase lg:inline">
          {lang}
        </span>
      </button>

      {open && (
        <div className="glass-panel animate-scale-in absolute right-0 z-[60] mt-2 w-72 space-y-4 p-4">
          <p className="text-xs font-extrabold uppercase tracking-wider text-forest-600/70 dark:text-cream-100/60">
            {t("settings")}
          </p>

          {/* language (idea 11) */}
          <div>
            <span className={labelCls}>{t("language")}</span>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                    lang === l.code
                      ? "bg-forest-500 text-white"
                      : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-forest-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
                  }`}
                >
                  <span aria-hidden="true">{l.flag}</span>
                  {l.label}
                </button>
              ))}
            </div>
            {lang === "ar" && (
              <p className="animate-fade-in mt-1.5 text-[11px] text-forest-600/60 dark:text-cream-100/50">
                ← التخطيط من اليمين إلى اليسار
              </p>
            )}
          </div>

          {/* units (idea 13) */}
          <div>
            <span className={labelCls}>{t("units")}</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: "metric", label: t("metric") },
                { value: "imperial", label: t("imperial") },
              ].map((u) => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => setUnits(u.value)}
                  className={`rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                    units === u.value
                      ? "bg-warm-orange-500 text-white"
                      : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-warm-orange-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          {/* timezone (idea 12) */}
          <div>
            <span className={labelCls}>{t("timezone")}</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={selectCls}
            >
              {commonTimezones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* city (idea 15 context) */}
          <div>
            <span className={labelCls}>{t("city")}</span>
            <select
              value={cityId}
              onChange={(e) => setCity(e.target.value)}
              className={selectCls}
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flag} {c.label} — {c.country}
                </option>
              ))}
            </select>
          </div>

          {/* dark mode (idea 3) */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex w-full items-center justify-between rounded-xl bg-white/70 px-3 py-2.5 text-sm font-bold text-forest-600 ring-1 ring-cream-200 transition-colors hover:bg-forest-500/10 dark:bg-night-100 dark:text-cream-100 dark:ring-white/10"
          >
            <span>{t("darkMode")}</span>
            <span
              role="switch"
              aria-checked={theme === "dark"}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                theme === "dark" ? "bg-forest-500" : "bg-cream-200"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  theme === "dark" ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
