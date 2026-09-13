/**
 * FoodRescue — i18n (idea 11). A deliberately tiny i18n layer (~1 KB) instead
 * of react-i18next: `t(key, vars)` with {var} interpolation, 4 languages,
 * RTL support for Arabic. Translations live in dictionaries.js.
 */

import { en, es, fr, ar } from "./dictionaries";

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "es", label: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "ar", label: "العربية", flag: "🇸🇦", dir: "rtl" },
];

const DICTS = { en, es, fr, ar };
const LS_KEY = "foodrescue.lang";

/** Detect initial language: saved choice → browser language → English. */
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = (typeof navigator !== "undefined" && navigator.language) || "en";
  const base = nav.slice(0, 2).toLowerCase();
  return DICTS[base] ? base : "en";
}

export function saveLanguage(code) {
  try {
    localStorage.setItem(LS_KEY, code);
  } catch {
    /* ignore */
  }
}

export function languageDir(code) {
  return (LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]).dir;
}

/**
 * Translate `key` in `lang`, interpolating {vars}.
 * Falls back: lang → English → the key itself (so missing translations
 * never render blank text).
 */
export function translate(lang, key, vars) {
  const str = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  );
}
