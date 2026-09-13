import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import SettingsMenu from "./SettingsMenu";

/**
 * FoodRescue — sticky glassmorphism header with animated underline hover,
 * auth-aware actions, the international settings menu, dark-mode toggle,
 * and a slide-down mobile menu.
 */
export default function Navbar({ onLogin, onListSurplus, onOpenImpact }) {
  const { user, logout } = useAuth();
  const { t, theme, toggleTheme } = useSettings();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const NAV_ITEMS = [
    { label: t("navDiscover"), href: "#discover" },
    { label: t("navHow"), href: "#how-it-works" },
    { label: t("navAbout"), href: "#about" },
  ];

  const linkCls =
    "relative rounded-full px-4 py-2 text-sm font-semibold text-forest-600 transition-colors duration-200 hover:text-forest-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 dark:text-cream-100/85 dark:hover:text-cream-50";

  return (
    <header
      className={[
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-cream-200/80 bg-cream-50/80 shadow-sm backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-night-200/85"
          : "border-b border-transparent bg-cream-50/40 backdrop-blur-md dark:bg-night-200/40",
      ].join(" ")}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          className="group flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500"
          aria-label="FoodRescue — home"
        >
          <span
            aria-hidden="true"
            className="text-2xl transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110"
          >
            🌱
          </span>
          <span className="font-heading text-xl font-extrabold tracking-tight">
            <span className="text-forest-600 dark:text-cream-50">Food</span>
            <span className="text-warm-orange-500">Rescue</span>
          </span>
        </a>

        {/* Desktop nav — animated underline on hover */}
        <ul className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={`${linkCls} nav-underline`}>
                {item.label}
              </a>
            </li>
          ))}
          {user && (
            <li>
              <button
                type="button"
                onClick={onOpenImpact}
                className={`${linkCls} nav-underline`}
              >
                {t("navImpact")}
              </button>
            </li>
          )}
        </ul>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          {/* 🌐 language / units / timezone / city + 🌙 dark mode (ideas 3,11,12,13) */}
          <SettingsMenu onToggleTheme={toggleTheme} theme={theme} />
          {user ? (
            <>
              <span className="flex items-center gap-2 rounded-full bg-forest-500/10 px-4 py-2 text-sm font-bold text-forest-700 dark:text-cream-50">
                <span aria-hidden="true">👋</span>
                <span className="max-w-[9rem] truncate">{user.name || user.email}</span>
                <span className="rounded-full bg-warm-orange-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-warm-orange-600">
                  {user.role}
                </span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-full px-3 py-2 text-sm font-semibold text-forest-600/70 transition-colors hover:text-warm-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 dark:text-cream-100/60"
              >
                {t("navLogout")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="rounded-full px-4 py-2 text-sm font-semibold text-forest-600 transition-colors duration-200 hover:text-warm-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 dark:text-cream-100/85"
            >
              {t("navLogin")}
            </button>
          )}
          <button
            type="button"
            onClick={onListSurplus}
            className="rounded-full bg-warm-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 focus-visible:ring-offset-2"
          >
            {t("navList")}
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="inline-flex items-center justify-center rounded-lg p-2 text-forest-600 transition-colors hover:bg-forest-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 md:hidden dark:text-cream-100"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu — slide-down animation */}
      <div
        id="mobile-menu"
        className={[
          "overflow-hidden border-cream-200/80 bg-cream-50/95 backdrop-blur-xl transition-all duration-300 ease-out md:hidden dark:border-white/10 dark:bg-night-200/95",
          mobileOpen
            ? "max-h-[32rem] border-t opacity-100"
            : "max-h-0 border-t-0 opacity-0",
        ].join(" ")}
      >
        <ul className="space-y-1 px-4 py-3">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-4 py-3 text-base font-semibold text-forest-600 transition-colors hover:bg-forest-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500 dark:text-cream-100/85"
              >
                {item.label}
              </a>
            </li>
          ))}
          {user && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenImpact?.();
                }}
                className="block w-full rounded-xl px-4 py-3 text-left text-base font-semibold text-forest-600 transition-colors hover:bg-forest-500/10 dark:text-cream-100/85"
              >
                📊 {t("navImpact")}
              </button>
            </li>
          )}
          <li className="flex items-center justify-between px-4 py-2">
            <span className="text-sm font-semibold text-forest-600/70 dark:text-cream-100/60">
              {t("darkMode")}
            </span>
            <button
              type="button"
              onClick={toggleTheme}
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
            </button>
          </li>
          <li className="flex justify-end px-4 py-1">
            <SettingsMenu onToggleTheme={toggleTheme} theme={theme} />
          </li>
        </ul>
        <div className="flex flex-col gap-3 border-t border-cream-200/80 px-4 py-4 dark:border-white/10">
          {user ? (
            <button
              type="button"
              onClick={() => {
                logout();
                setMobileOpen(false);
              }}
              className="rounded-full border border-forest-500/30 px-5 py-2.5 text-sm font-bold text-forest-600 transition-colors hover:bg-forest-500/10 dark:text-cream-100"
            >
              {t("navLogout")} ({user.name || user.email})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onLogin();
              }}
              className="rounded-full border border-forest-500/30 px-5 py-2.5 text-sm font-bold text-forest-600 transition-colors hover:bg-forest-500/10 dark:text-cream-100"
            >
              {t("navLogin")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onListSurplus();
            }}
            className="rounded-full bg-warm-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-orange-glow transition-colors hover:bg-warm-orange-600"
          >
            {t("navList")}
          </button>
        </div>
      </div>
    </header>
  );
}
