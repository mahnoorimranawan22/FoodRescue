import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  detectLanguage,
  saveLanguage,
  languageDir,
  translate,
} from "../lib/i18n";
import { cityById } from "../lib/geo";

/**
 * Global user settings (ideas 3, 11, 12, 13): language + RTL, units,
 * timezone context and dark mode — persisted to localStorage and applied
 * to <html> (class="dark" / dir) so every component can consume it.
 */
const Ctx = createContext(null);

export function useSettings() {
  return useContext(Ctx);
}

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ?? fallback;
  } catch {
    return fallback;
  }
};

export function SettingsProvider({ children }) {
  const [lang, setLang] = useState(() => detectLanguage());
  const [units, setUnitsState] = useState(() =>
    read("foodrescue.units", "metric")
  );
  const [timezone, setTimezoneState] = useState(() =>
    read("foodrescue.tz", "") // "" = automatic (device timezone)
  );
  const [cityId, setCityId] = useState(() => read("foodrescue.city", "london"));
  const [theme, setTheme] = useState(() => {
    const saved = read("foodrescue.theme", "");
    if (saved) return saved;
    // Default to the OS preference on first visit
    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });

  /* DOM side effects — theme class + direction (RTL for Arabic) */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem("foodrescue.theme", theme);
    } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const dir = languageDir(lang);
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const t = useCallback(
    (key, vars) => translate(lang, key, vars),
    [lang]
  );

  const setLanguage = useCallback((code) => {
    setLang(code);
    saveLanguage(code);
  }, []);

  const setUnits = useCallback((u) => {
    setUnitsState(u);
    try { localStorage.setItem("foodrescue.units", u); } catch { /* ignore */ }
  }, []);

  const setTimezone = useCallback((tz) => {
    setTimezoneState(tz);
    try { localStorage.setItem("foodrescue.tz", tz); } catch { /* ignore */ }
  }, []);

  const setCity = useCallback((id) => {
    setCityId(id);
    try { localStorage.setItem("foodrescue.city", id); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => {
    const city = cityById(cityId);
    const tz = timezone || (city?.tz ?? undefined);
    return {
      lang,
      dir: languageDir(lang),
      setLanguage,
      t,
      units,
      setUnits,
      timezone,
      tz, // resolved timezone (device default if unset)
      setTimezone,
      cityId,
      city,
      setCity,
      theme,
      toggleTheme: () => setTheme((th) => (th === "dark" ? "light" : "dark")),
    };
  }, [lang, setLanguage, t, units, setUnits, timezone, cityId, setCity, theme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
