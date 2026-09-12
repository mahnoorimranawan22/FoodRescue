import { useEffect } from "react";

/**
 * Animated, accessible modal: scale-in panel, blurred backdrop,
 * Escape to close, click-outside to close, body scroll lock.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-forest-700/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-panel animate-scale-in max-h-[92vh] w-full overflow-y-auto rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-heading text-xl font-bold text-forest-700">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full p-2 text-forest-600 transition-all duration-200 hover:rotate-90 hover:bg-forest-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-orange-500"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
