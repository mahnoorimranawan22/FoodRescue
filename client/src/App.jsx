import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import Discover from "./pages/Discover";
import ProviderDashboard from "./pages/ProviderDashboard";
import RecipientDashboard from "./pages/RecipientDashboard";
import Impact from "./pages/Impact";
import AuthModal from "./components/AuthModal";
import ListSurplusModal from "./components/ListSurplusModal";
import ImpactDashboard from "./components/ImpactDashboard";
import Reveal from "./components/Reveal";
import api from "./lib/api";
import { HERO_IMAGES, ABOUT_IMAGES } from "./lib/images";
import { formatNumber } from "./lib/format";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { ToastProvider, useToast } from "./components/Toast";

const STEPS = [
  {
    icon: "🍽️",
    title: "Businesses list surplus",
    body: "Restaurants, grocers and events post what's left — quantities, pickup window, location.",
  },
  {
    icon: "🤝",
    title: "Charities claim instantly",
    body: "Verified local organizations browse nearby listings and claim what they can collect.",
  },
  {
    icon: "🌎",
    title: "Good food gets eaten",
    body: "Meals reach plates instead of landfill — tracked, credited and shared by the community.",
  },
];

const FILTERS = [
  { key: "all", label: "filterAll", emoji: "🌍" },
  { key: "Prepared Food", label: "filterPrepared", emoji: "🍲" },
  { key: "Bakery", label: "filterBakery", emoji: "🥖" },
  { key: "Produce", label: "filterProduce", emoji: "🥕" },
  { key: "Dairy", label: "filterDairy", emoji: "🧀" },
  { key: "Packaged Goods", label: "filterPackaged", emoji: "🥫" },
];

const TAG_FILTERS = ["vegetarian", "vegan", "halal", "kosher", "gluten-free"];

const TICKER = [
  "12,480 meals rescued",
  "96 partner organizations",
  "18.4t CO₂ saved",
  "4 cities live",
  "100% free for charities",
];

function Ticker() {
  const row = (key) => (
    <div
      key={key}
      className="flex shrink-0 items-center"
      aria-hidden={key === "b" ? true : undefined}
    >
      {TICKER.map((item) => (
        <span
          key={`${key}-${item}`}
          className="mx-6 flex items-center gap-2 text-sm font-bold tracking-wide text-cream-50"
        >
          <span aria-hidden="true">🌱</span>
          {item}
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden bg-forest-700 py-3">
      <div className="animate-marquee flex w-max">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

function Hero({ onOpenList }) {
  const { t } = useSettings();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .getStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="relative flex min-h-[88vh] items-center overflow-hidden">
      {/* Full-bleed banner photo + forest gradient scrim */}
      <img
        src={HERO_IMAGES.spread}
        alt=""
        aria-hidden="true"
        {...{ fetchpriority: "high" }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-forest-700/90 via-forest-600/75 to-forest-700/60" />
      <div
        aria-hidden="true"
        className="animate-float-slow pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-cream-50/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="animate-float-slow pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-warm-orange-500/20 blur-3xl"
        style={{ animationDelay: "1.6s" }}
      />

      <div className="relative mx-auto w-full max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <span className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-cream-50/30 bg-cream-50/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-cream-50 backdrop-blur-sm">
          🌱 {t("heroBadge")}
        </span>
        <h1 className="animate-fade-in-slow mx-auto mt-6 max-w-3xl text-balance font-heading text-4xl font-extrabold leading-tight text-cream-50 drop-shadow-lg sm:text-5xl lg:text-6xl">
          {t("heroTitleA")}{" "}
          <span className="relative text-warm-orange-500">
            {t("heroTitleB")}
            <svg
              aria-hidden="true"
              className="absolute -bottom-2 left-0 h-3 w-full text-warm-orange-500/50"
              viewBox="0 0 200 9"
              preserveAspectRatio="none"
            >
              <path
                d="M2 7C60 2 140 2 198 7"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h1>
        <p
          className="animate-fade-in-slow mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-cream-100/90 sm:text-xl"
          style={{ animationDelay: "0.15s" }}
        >
          {t("heroSub")}
        </p>
        <div
          className="animate-fade-in-slow mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          style={{ animationDelay: "0.3s" }}
        >
          <a
            href="#discover"
            className="w-full rounded-full bg-warm-orange-500 px-8 py-3.5 text-base font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 sm:w-auto"
          >
            {t("heroCta1")}
          </a>
          <button
            type="button"
            onClick={onOpenList}
            className="w-full rounded-full border-2 border-cream-50/40 px-8 py-3.5 text-base font-bold text-cream-50 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cream-50 hover:bg-cream-50/10 sm:w-auto"
          >
            {t("heroCta2")}
          </button>
        </div>

        {/* Impact stats — glass cards over the banner */}
        {stats && (
          <div className="animate-fade-in-slow mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { value: formatNumber(stats.mealsRescued), label: t("mealsRescued") },
              { value: formatNumber(stats.partners), label: t("partners") },
              { value: formatNumber(stats.cities), label: t("cities") },
              { value: Number(stats.co2SavedTons).toFixed(1), label: t("co2Saved") },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-cream-50/25 bg-cream-50/10 px-4 py-5 backdrop-blur-md"
              >
                <p className="font-heading text-2xl font-extrabold text-cream-50">
                  {s.value}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-cream-100/80">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useSettings();
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-cream-100 py-20 dark:bg-night-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold text-forest-700 sm:text-4xl dark:text-cream-50">
            {t("howTitle")}
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 140}>
              <div className="glass-panel h-full p-8 transition-shadow duration-300 hover:shadow-forest-glow">
                <span
                  aria-hidden="true"
                  className="inline-block text-4xl transition-transform duration-300 hover:scale-125 hover:-rotate-12"
                >
                  {step.icon}
                </span>
                <h3 className="mt-5 text-xl font-bold text-forest-600 dark:text-cream-50">
                  {step.title}
                </h3>
                <p className="mt-3 leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutFooter({ onOpenList }) {
  const { t } = useSettings();
  return (
    <>
      <section id="about" className="scroll-mt-24 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-forest-500/25 bg-forest-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-cream-100/80">
                ♻️ {t("navAbout")}
              </span>
              <h2 className="mt-4 text-3xl font-extrabold text-forest-700 sm:text-4xl dark:text-cream-50">
                {t("aboutTitle")}
              </h2>
              <p className="mt-4 leading-relaxed text-forest-700/70 dark:text-cream-100/70">
                One in eight people face food insecurity while roughly a third
                of all food produced is thrown away. FoodRescue exists to close
                that gap — locally, instantly, and with dignity.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal variant="left">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <img
                  src={ABOUT_IMAGES.volunteers}
                  alt="Volunteers packing crates of rescued food for local charities"
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-3xl object-cover shadow-forest-glow"
                />
                <img
                  src={ABOUT_IMAGES.community}
                  alt="Neighbours sharing a community dinner made from rescued ingredients"
                  loading="lazy"
                  className="absolute -bottom-8 -right-4 hidden w-44 rounded-2xl object-cover ring-8 ring-cream-50 sm:block sm:h-32 lg:-right-8 dark:ring-night-200"
                />
                <div className="glass-panel absolute -top-5 -left-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-forest-glow sm:-left-6">
                  <span aria-hidden="true" className="text-xl">
                    🥘
                  </span>
                  <div>
                    <p className="font-heading text-sm font-extrabold text-forest-700 dark:text-cream-50">
                      12,480+ {t("mealsRescued")}
                    </p>
                    <p className="text-xs text-forest-600/70 dark:text-cream-100/60">
                      and counting, every single day
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <h3 className="font-heading text-2xl font-bold text-forest-700 dark:text-cream-50">
                From a bakery's leftover loaves to a neighbour's dinner table
              </h3>
              <p className="mt-4 leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                FoodRescue started with a simple observation: a bakery's
                unsold loaves, a caterer's extra trays, a grocer's
                blemished-but-perfect produce — all perfectly good food,
                destined for the bin, while neighbours line up at food banks
                blocks away.
              </p>
              <p className="mt-3 leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                So we built the missing bridge: a live marketplace where
                surplus becomes someone's meal within hours, not days —
                tracked from pickup to plate, in every city we launch.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  ["✅", "Verified providers and recipients — every account checked"],
                  ["🎫", "4-digit pickup codes keep every handover smooth and accountable"],
                  ["📈", "Impact you can see — meals, partners and CO₂ tracked live"],
                ].map(([icon, text]) => (
                  <li key={text} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-500/10 text-sm"
                    >
                      {icon}
                    </span>
                    <span className="text-sm font-semibold text-forest-700/85 dark:text-cream-100/75">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* idea 16 — food safety & liability / donor protections */}
          <Reveal delay={80} className="mt-16">
            <div
              id="compliance"
              className="glass-panel grid gap-6 rounded-3xl p-8 sm:grid-cols-[auto,1fr] sm:p-10"
            >
              <span aria-hidden="true" className="text-5xl">
                🛡️
              </span>
              <div>
                <h3 className="font-heading text-xl font-bold text-forest-700 dark:text-cream-50">
                  {t("complianceTitle")}
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-forest-700/75 dark:text-cream-100/70">
                  {t("complianceBody")}
                </p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-forest-500/10 px-4 py-1.5 text-xs font-bold text-forest-600 dark:text-cream-100/80">
                  💚 {t("complianceFree")}
                </span>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal variant="scale" className="mt-16">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-forest-600 px-6 py-14 text-center shadow-forest-glow sm:px-12">
            <img
              src={HERO_IMAGES.spread}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-25"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-forest-600/70 via-forest-700/60 to-forest-600/85" />
            <div className="relative">
              <h2 className="text-balance font-heading text-3xl font-extrabold text-cream-50 sm:text-4xl">
                Every plate saved is a small act of climate action
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-cream-100/85 leading-relaxed">
                Food waste drives up to 10% of global greenhouse emissions.
                FoodRescue turns your surplus into measurable community impact —
                free, forever, for charities.
              </p>
              <button
                type="button"
                onClick={onOpenList}
                className="mt-8 rounded-full bg-warm-orange-500 px-8 py-3.5 text-base font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600"
              >
                {t("heroCta2")}
              </button>
            </div>
          </div>
        </Reveal>
      </section>
      <footer className="border-t border-cream-200 bg-cream-100 py-10 dark:border-white/10 dark:bg-night-100">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="font-heading text-lg font-bold text-forest-600 dark:text-cream-50">
            🌱 FoodRescue — Give Good Food Another Chance
          </p>
          <p className="mt-2 text-sm text-forest-700/60 dark:text-cream-100/50">
            © {new Date().getFullYear()} FoodRescue. {t("footerTag")}
          </p>
        </div>
      </footer>
    </>
  );
}

function Shell() {
  const [authOpen, setAuthOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const { user } = useAuth();
  // "site" | "provider" | "recipient" | "impact" — views, not routes
  const [view, setView] = useState("site");
  const openDashboard = () =>
    setView(user?.role === "provider" ? "provider" : "recipient");
  const exitDashboard = () => {
    setView("site");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      id="top"
      className="min-h-screen bg-cream-50 font-sans text-forest-700 dark:bg-night-200 dark:text-cream-50"
    >
      <Navbar
        onLogin={() => setAuthOpen(true)}
        onListSurplus={() => setListOpen(true)}
        onOpenImpact={() => setImpactOpen(true)}
        onImpactPage={() => {
          setView("impact");
          window.scrollTo({ top: 0 });
        }}
        onDashboard={openDashboard}
      />
      {view === "impact" ? (
        <main>
          <Impact onExit={exitDashboard} />
        </main>
      ) : view !== "site" ? (
        <main>
          {view === "provider" ? (
            <ProviderDashboard onExit={exitDashboard} />
          ) : (
            <RecipientDashboard onExit={exitDashboard} />
          )}
        </main>
      ) : (
        <main>
          <Hero onOpenList={() => setListOpen(true)} />
          <Ticker />
          <Discover
            onOpenList={() => setListOpen(true)}
            refreshSignal={refreshSignal}
          />
          <HowItWorks />
          <AboutFooter onOpenList={() => setListOpen(true)} />
        </main>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <ListSurplusModal
        open={listOpen}
        onClose={() => setListOpen(false)}
        onCreated={() => setRefreshSignal((n) => n + 1)}
      />
      <ImpactDashboard open={impactOpen} onClose={() => setImpactOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
