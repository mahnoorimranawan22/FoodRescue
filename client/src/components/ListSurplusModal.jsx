import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import api from "../lib/api";
import { useToast } from "./Toast";
import { useSettings } from "../context/SettingsContext";
import { CATEGORY_IMAGES } from "../lib/images";
import { smartAssist } from "../lib/smart";

const CATEGORIES = [
  "Prepared Food",
  "Bakery",
  "Produce",
  "Dairy",
  "Packaged Goods",
];
const UNITS = ["portions", "loaves", "crates", "items", "trays", "kg"];
const URGENCIES = [
  { value: "normal", labelKey: "urgencyNormal", hint: "Plenty of time" },
  { value: "expiring_soon", labelKey: "urgencySoon", hint: "Within ~24h" },
  { value: "urgent", labelKey: "urgencyUrgent", hint: "Needs pickup now" },
];
const ALL_TAGS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "keep refrigerated",
];

const inputCls =
  "w-full rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-sm text-forest-700 placeholder:text-forest-600/40 focus:border-warm-orange-500 focus:outline-none focus:ring-2 focus:ring-warm-orange-500/30 dark:bg-night-100 dark:text-cream-50";

/** Downscale a picked photo to a ≤900px JPEG dataURL (keeps payloads small). */
function fileToDataUrl(file, maxEdge = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Not a readable image"));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ListSurplusModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const { t, cityId } = useSettings();
  const [busy, setBusy] = useState(false);
  const [smart, setSmart] = useState(null);
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
    tags: [],
  });
  const fileRef = useRef(null);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  /* Smart Assist (idea 17): infer fields from the title as the user types.
   * Tries the server's Groq endpoint first (real LLM classification); falls
   * back to the instant local heuristic in demo mode / when offline. */
  useEffect(() => {
    if (!form.title || form.title.trim().length < 4) {
      setSmart(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      let suggestion = null;
      try {
        const { classification } = await api.classifyFood(form.title);
        if (classification) {
          suggestion = {
            category: classification.category,
            unit: form.unit,
            urgencyLevel: classification.urgency,
            tags: [],
            imageUrl: CATEGORY_IMAGES[classification.category],
            summary: classification.summary,
          };
        }
      } catch {
        /* offline / anonymous / demo mode — local heuristic below */
      }
      if (cancelled) return;
      if (!suggestion) {
        suggestion = smartAssist({
          title: form.title,
          quantity: form.quantity,
        });
      }
      if (!suggestion) {
        setSmart(null);
        return;
      }
      setSmart(suggestion);
      setForm((f) => {
        const isAutoPhoto =
          !f.imageUrl || Object.values(CATEGORY_IMAGES).includes(f.imageUrl);
        return {
          ...f,
          category: suggestion.category,
          unit: suggestion.unit,
          urgencyLevel: suggestion.urgencyLevel,
          imageUrl: isAutoPhoto ? suggestion.imageUrl : f.imageUrl,
          tags: Array.from(new Set([...(f.tags || []), ...suggestion.tags])),
        };
      });
    }, 450);
    return () => {
      clearTimeout(id);
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  const toggleTag = (tag) =>
    setForm((f) => ({
      ...f,
      tags: f.tags?.includes(tag)
        ? f.tags.filter((x) => x !== tag)
        : [...(f.tags || []), tag],
    }));

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file", "error");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((f) => ({ ...f, imageUrl: dataUrl }));
      toast("Photo attached 📸", "success");
    } catch (err) {
      toast(err.message || "Could not read that image", "error");
    } finally {
      e.target.value = ""; // allow re-picking the same file
    }
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
        tags: form.tags || [],
        cityId,
        pickupWindow,
        expiryEstimate: new Date(
          `${form.pickupDate}T${form.end}:00`
        ).toISOString(),
      });
      toast(t("listPublished"), "success");
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
      title={t("listTitle")}
      maxWidth="max-w-lg"
    >
      <form onSubmit={submit} className="animate-fade-in space-y-4">
        <input
          required
          minLength={3}
          type="text"
          placeholder="What do you have? e.g. Fresh sourdough loaves"
          aria-label={t("listWhat")}
          value={form.title}
          onChange={set("title")}
          className={inputCls}
        />

        {/* ✨ Smart Assist suggestion bar (idea 17) */}
        {smart && (
          <div className="animate-fade-in rounded-xl border border-forest-500/25 bg-forest-500/10 px-4 py-2.5 text-xs font-semibold text-forest-700 dark:text-cream-50">
            {t("listSmartAssist", {
              category: smart.category,
              unit: smart.unit,
              urgency: smart.urgencyLevel,
            })}
            {smart.summary && (
              <p className="mt-1 font-medium text-forest-600/80 dark:text-cream-100/70">
                ✨ {smart.summary}
              </p>
            )}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
            {t("listPhoto")}{" "}
            <span className="font-medium normal-case tracking-normal text-forest-600/50 dark:text-cream-100/40">
              — {t("listUpload")}
            </span>
          </span>
          <div className="flex items-center gap-3">
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Listing photo preview"
                className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-cream-200 dark:ring-white/10"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
            <input
              type="url"
              placeholder={t("listPhotoUrl")}
              value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl}
              onChange={set("imageUrl")}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="shrink-0 rounded-xl border-2 border-forest-500/30 px-3 py-2.5 text-sm font-bold text-forest-600 transition-colors hover:border-forest-500 hover:bg-forest-500/10 dark:text-cream-100"
              title="Upload a photo from your device"
            >
              📷
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="hidden"
            />
          </div>
        </label>

        {/* Dietary & safety tags (idea 2) */}
        <div>
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
            {t("listTags")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TAGS.map((tag) => {
              const active = form.tags?.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all duration-150 ${
                    active
                      ? "bg-forest-500 text-white shadow-forest-glow"
                      : "bg-white/70 text-forest-600 ring-1 ring-cream-200 hover:bg-forest-500/10 dark:bg-night-100 dark:text-cream-100/80 dark:ring-white/10"
                  }`}
                >
                  {active ? "✓ " : "+ "}
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
              {t("listCategory")}
            </span>
            <select value={form.category} onChange={set("category")} className={inputCls}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
              {t("listQuantity")}
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

        <div className="rounded-xl border border-cream-200 bg-white p-4 dark:border-white/10 dark:bg-night-100">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
            {t("listWindow")}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={form.pickupDate} onChange={set("pickupDate")} className={inputCls} />
            <input type="time" value={form.start} onChange={set("start")} className={inputCls} />
            <input type="time" value={form.end} onChange={set("end")} className={inputCls} />
          </div>
          <p className="mt-2 text-[11px] text-forest-600/50 dark:text-cream-100/40">
            Shown to recipients in <strong>their</strong> timezone.
          </p>
        </div>

        <div>
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-forest-600/70 dark:text-cream-100/60">
            {t("listUrgency")}
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
                    : "border-cream-200 bg-white hover:border-forest-500/40 dark:border-white/10 dark:bg-night-100"
                }`}
              >
                <span className="block text-sm font-bold text-forest-700 dark:text-cream-50">
                  {t(u.labelKey)}
                </span>
                <span className="block text-[11px] text-forest-600/70 dark:text-cream-100/50">
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
          {busy ? "Publishing…" : t("listPublish")}
        </button>
      </form>
    </Modal>
  );
}
