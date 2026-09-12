import { useState } from "react";
import Modal from "./Modal";
import api from "../lib/api";
import { useToast } from "./Toast";
import { CATEGORY_IMAGES } from "../lib/images";

const CATEGORIES = [
  "Prepared Food",
  "Bakery",
  "Produce",
  "Dairy",
  "Packaged Goods",
];
const UNITS = ["portions", "loaves", "crates", "items", "trays", "kg"];
const URGENCIES = [
  { value: "normal", label: "Normal", hint: "Plenty of time" },
  { value: "expiring_soon", label: "Expiring soon", hint: "Within ~24h" },
  { value: "urgent", label: "Urgent", hint: "Needs pickup now" },
];

const inputCls =
  "w-full rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30";

export default function ListSurplusModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "Prepared Food",
    quantity: 10,
    unit: "portions",
    imageUrl: CATEGORY_IMAGES["Prepared Food"] || "",
    pickupDate: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
    start: "14:00",
    end: "18:00",
    urgencyLevel: "normal",
  });

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Changing category auto-picks its stock photo unless the user typed a
  // custom URL (anything that isn't one of our catalog images).
  const setCategory = (e) => {
    const category = e.target.value;
    setForm((f) => {
      const isAutoPhoto =
        !f.imageUrl ||
        Object.values(CATEGORY_IMAGES).includes(f.imageUrl);
      return {
        ...f,
        category,
        imageUrl: isAutoPhoto ? CATEGORY_IMAGES[category] || "" : f.imageUrl,
      };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const pickupWindow = {
        start: new Date(`${form.pickupDate}T${form.start}:00`).toISOString(),
        end: new Date(`${form.pickupDate}T${form.end}:00`).toISOString(),
      };
      const { listing } = await api.createListing({
        title: form.title,
        category: form.category,
        quantity: Number(form.quantity),
        unit: form.unit,
        imageUrl: form.imageUrl || undefined,
        urgencyLevel: form.urgencyLevel,
        pickupWindow,
        expiryEstimate: new Date(
          `${form.pickupDate}T${form.end}:00`
        ).toISOString(),
      });
      toast("Listing published — recipients can see it now!", "success");
      onCreated?.(listing);
      onClose();
      setForm((f) => ({ ...f, title: "" }));
    } catch (err) {
      toast(err.message || "Could not publish listing", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="List surplus food 🍽️"
      maxWidth="max-w-lg"
    >
      <form onSubmit={submit} className="animate-fade-in space-y-4">
        <input
          required
          minLength={3}
          type="text"
          placeholder="What do you have? e.g. Fresh sourdough loaves"
          value={form.title}
          onChange={set("title")}
          className={inputCls}
        />

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-forest-600/70">
            Photo{" "}
            <span className="font-medium normal-case tracking-normal text-forest-600/50">
              (optional — a stock photo is picked from the category)
            </span>
          </span>
          <div className="flex items-center gap-3">
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Listing photo preview"
                className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-cream-200"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
            <input
              type="url"
              placeholder="https://… paste a food photo URL"
              value={form.imageUrl}
              onChange={set("imageUrl")}
              className={inputCls}
            />
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-forest-600/70">
              Category
            </span>
            <select value={form.category} onChange={setCategory} className={inputCls}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-forest-600/70">
              Quantity
            </span>
            <div className="flex gap-2">
              <input
                required
                type="number"
                min={1}
                value={form.quantity}
                onChange={set("quantity")}
                className={inputCls}
              />
              <select value={form.unit} onChange={set("unit")} className={inputCls}>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="rounded-xl border border-cream-200 bg-white p-4">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-forest-600/70">
            Pickup window
          </span>
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={form.pickupDate} onChange={set("pickupDate")} className={inputCls} />
            <input type="time" value={form.start} onChange={set("start")} className={inputCls} />
            <input type="time" value={form.end} onChange={set("end")} className={inputCls} />
          </div>
        </div>

        <div>
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-forest-600/70">
            Urgency
          </span>
          <div className="grid grid-cols-3 gap-2">
            {URGENCIES.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, urgencyLevel: u.value }))}
                className={`rounded-xl border p-3 text-left transition-all duration-200 ${
                  form.urgencyLevel === u.value
                    ? "border-warm-orange-500 bg-warm-orange-500/10 ring-2 ring-warm-orange-500/30"
                    : "border-cream-200 bg-white hover:border-forest-500/40"
                }`}
              >
                <span className="block text-sm font-bold text-forest-700">
                  {u.label}
                </span>
                <span className="block text-[11px] text-forest-600/70">
                  {u.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-warm-orange-500 px-5 py-3 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Publishing…" : "Publish listing"}
        </button>
      </form>
    </Modal>
  );
}
