import { useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { useSettings } from "../context/SettingsContext";

/**
 * Claim confirmation modal — the target of every SurplusCard's "Rescue Food"
 * button. Shows a summary of the listing, performs the (atomic, server-side)
 * reservation, then reveals the 4-digit pickup code with a deep link to My
 * Claims. Unauthenticated visitors get a login nudge instead.
 */
export default function ClaimModal({ listing, onClose, onClaimed }) {
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useSettings();
  const [claiming, setClaiming] = useState(false);
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState(null);

  if (!listing) return null;

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      const { claim: c } = await api.createClaim(listing._id);
      setClaim(c);
      toast(t("reservedToast", { code: c.pickupCode }), "success");
      onClaimed?.(c);
    } catch (err) {
      setError(err.message || t("claimFailed"));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-forest-700/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("claimModalTitle")}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="animate-scale-in glass-panel w-full max-w-md rounded-3xl p-8 text-center">
        {claim ? (
          <>
            <span aria-hidden="true" className="text-5xl">
              🎫
            </span>
            <h3 className="mt-4 font-heading text-2xl font-extrabold text-forest-700 dark:text-cream-50">
              {t("reserved")}
            </h3>
            <p className="mt-3 text-6xl font-heading font-extrabold tracking-[0.3em] text-warm-orange-600">
              {claim.pickupCode}
            </p>
            <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-forest-600/80 dark:text-cream-100/70">
              {t("claimCodeHint")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-forest-600 px-6 py-3 text-sm font-bold text-white shadow-forest-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest-700"
            >
              {t("claimViewClaims")}
            </button>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="text-5xl">
              🥡
            </span>
            <h3 className="mt-4 font-heading text-2xl font-extrabold text-forest-700 dark:text-cream-50">
              {t("claimModalTitle")}
            </h3>

            <div className="mt-5 rounded-2xl bg-cream-100/80 p-4 text-left dark:bg-night-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-forest-600/60 dark:text-cream-100/50">
                {t("claimSummary")}
              </p>
              <p className="mt-1 font-heading text-lg font-bold text-forest-700 dark:text-cream-50">
                {listing.title}
              </p>
              <p className="mt-1 text-sm text-forest-600/80 dark:text-cream-100/70">
                {listing.quantity} {listing.unit || "portions"} ·{" "}
                <span className="font-semibold">{t("claimProvider")}</span>{" "}
                {listing.providerName || "Local provider"}
              </p>
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}

            {!user ? (
              <p className="mt-5 rounded-xl bg-warm-orange-500/10 px-4 py-3 text-sm font-semibold text-warm-orange-600">
                {t("loginToClaim")}
              </p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border-2 border-forest-500/25 px-5 py-3 text-sm font-bold text-forest-600 transition-colors hover:bg-forest-500/10 dark:text-cream-100"
              >
                {t("claimClose")}
              </button>
              <button
                type="button"
                onClick={handleClaim}
                disabled={claiming || !user}
                className="flex-1 rounded-full bg-warm-orange-500 px-5 py-3 text-sm font-bold text-white shadow-orange-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-warm-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {claiming ? t("claiming") : t("rescueFood")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
