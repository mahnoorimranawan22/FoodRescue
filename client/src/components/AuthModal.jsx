import { useState } from "react";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";

const ROLES = [
  { value: "recipient", label: "Recipient", hint: "Claim surplus food" },
  { value: "provider", label: "Provider", hint: "Donate surplus food" },
];

export default function AuthModal({ open, onClose, initialMode = "login" }) {
  const { login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "recipient",
  });
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await login(form.email, form.password)
          : await register(form);
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
      title={mode === "login" ? "Welcome back 👋" : "Join FoodRescue 🌱"}
      maxWidth="max-w-md"
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-cream-100 p-1">
        {["login", "register"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-2 text-sm font-bold capitalize transition-all duration-200 ${
              mode === m
                ? "bg-white text-forest-700 shadow-sm"
                : "text-forest-600/70 hover:text-forest-700"
            }`}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <>
            <input
              required
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={set("name")}
              className="w-full rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30"
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
                      : "border-cream-200 bg-white hover:border-forest-500/40"
                  }`}
                >
                  <span className="block text-sm font-bold text-forest-700">
                    {r.label}
                  </span>
                  <span className="block text-xs text-forest-600/70">
                    {r.hint}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <input
          required
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={set("email")}
          className="w-full rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30"
        />
        <input
          required
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={set("password")}
          className="w-full rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-warm-orange-500 px-5 py-3 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 disabled:cursor-wait disabled:opacity-60"
        >
          {busy
            ? "One moment…"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </button>
        <p className="text-center text-xs text-forest-600/60">
          Demo tip: any email + password works while the API is offline.
        </p>
      </form>
    </Modal>
  );
}
