import { useState } from "react";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { useSettings } from "../context/SettingsContext";

const ROLES = [
  { value: "recipient", labelKey: "roleRecipient", hintKey: "roleRecipientHint" },
  { value: "provider", labelKey: "roleProvider", hintKey: "roleProviderHint" },
];

/** idea 14 — international phone support: common dial codes first, then world. */
export const COUNTRIES = [
  { code: "US", name: "United States", flag: "🇺🇸", dial: "+1" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dial: "+44" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰", dial: "+92" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", dial: "+971" },
  { code: "FR", name: "France", flag: "🇫🇷", dial: "+33" },
  { code: "ES", name: "Spain", flag: "🇪🇸", dial: "+34" },
  { code: "DE", name: "Germany", flag: "🇩🇪", dial: "+49" },
  { code: "IN", name: "India", flag: "🇮🇳", dial: "+91" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", dial: "+234" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", dial: "+55" },
  { code: "CA", name: "Canada", flag: "🇨🇦", dial: "+1" },
  { code: "AU", name: "Australia", flag: "🇦🇺", dial: "+61" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", dial: "+20" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", dial: "+966" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", dial: "+27" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", dial: "+52" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", dial: "+62" },
  { code: "TR", name: "Türkiye", flag: "🇹🇷", dial: "+90" },
];

const inputCls =
  "w-full rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30 dark:bg-night-100 dark:text-cream-50";

export default function AuthModal({ open, onClose, initialMode = "login" }) {
  const { login, register } = useAuth();
  const { t } = useSettings();
  const toast = useToast();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "recipient",
    country: "GB",
    phone: "",
  });
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const selected = COUNTRIES.find((c) => c.code === form.country);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload =
        mode === "register"
          ? {
              ...form,
              phone: form.phone ? `${selected?.dial ?? ""} ${form.phone.trim()}` : "",
            }
          : { email: form.email, password: form.password };
      const result =
        mode === "login"
          ? await login(form.email, form.password)
          : await register(payload);
      toast(
        mode === "login"
          ? `Welcome back${result.user?.name ? `, ${result.user.name}` : ""}!`
          : "Account created — welcome to FoodRescue!",
        "success"
      );
      if (result.demo) {
        toast("Running in demo mode (server offline)", "info");
      }
      onClose();
    } catch (err) {
      toast(err.message || "Authentication failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "login" ? t("authWelcome") : t("authJoin")}
      maxWidth="max-w-md"
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-cream-100 p-1 dark:bg-night-100">
        {["login", "register"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ${
              mode === m
                ? "bg-white text-forest-700 shadow-sm dark:bg-forest-500/30 dark:text-cream-50"
                : "text-forest-600/70 hover:text-forest-700 dark:text-cream-100/60"
            }`}
          >
            {m === "login" ? t("authLogIn") : t("authSignUp")}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <>
            <input
              required
              type="text"
              placeholder={t("authName")}
              aria-label={t("authName")}
              value={form.name}
              onChange={set("name")}
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-3">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                  className={`rounded-xl border p-3 text-left transition-all duration-200 ${
                    form.role === r.value
                      ? "border-warm-orange-500 bg-warm-orange-500/10 ring-2 ring-warm-orange-500/30"
                      : "border-cream-200 bg-white hover:border-forest-500/40 dark:border-white/10 dark:bg-night-100"
                  }`}
                >
                  <span className="block text-sm font-bold text-forest-700 dark:text-cream-50">
                    {t(r.labelKey)}
                  </span>
                  <span className="block text-xs text-forest-600/70 dark:text-cream-100/50">
                    {t(r.hintKey)}
                  </span>
                </button>
              ))}
            </div>

            {/* idea 14 — country + international phone with dial codes */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
                  {t("authCountry")}
                </span>
                <select
                  value={form.country}
                  onChange={set("country")}
                  className={inputCls}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({c.dial})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
                  Phone <span className="font-medium normal-case">(optional)</span>
                </span>
                <div className="flex items-stretch gap-0">
                  <span className="flex items-center rounded-l-xl border border-r-0 border-cream-200 bg-cream-100 px-3 text-sm font-bold text-forest-600 dark:border-white/10 dark:bg-night-100 dark:text-cream-100/80">
                    {selected?.flag} {selected?.dial}
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="555 010 2233"
                    value={form.phone}
                    onChange={set("phone")}
                    className="w-full rounded-r-xl border border-cream-200 bg-white px-3 py-2.5 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30 dark:border-white/10 dark:bg-night-100 dark:text-cream-50"
                  />
                </div>
              </label>
            </div>
          </>
        )}
        <input
          required
          type="email"
          placeholder={t("authEmail")}
          aria-label={t("authEmail")}
          value={form.email}
          onChange={set("email")}
          className={inputCls}
        />
        <input
          required
          type="password"
          placeholder={t("authPassword")}
          aria-label={t("authPassword")}
          value={form.password}
          onChange={set("password")}
          className={inputCls}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-warm-orange-500 px-5 py-3 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 disabled:cursor-wait disabled:opacity-60"
        >
          {busy
            ? t("authCreating")
            : mode === "login"
              ? t("authLogIn")
              : t("authSignUp")}
        </button>
        <p className="text-center text-xs text-forest-600/60 dark:text-cream-100/50">
          {t("authDemoTip")}
        </p>
      </form>
    </Modal>
  );
}
