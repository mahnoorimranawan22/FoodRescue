import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

/**
 * Minimal toast system: <ToastProvider> wraps the app, `useToast()` returns
 * `push(message, type)`. Toasts auto-dismiss and animate in/out.
 */
const Ctx = createContext(null);

export function useToast() {
  return useContext(Ctx);
}

const STYLES = {
  success: { icon: "✅", ring: "ring-forest-500/30", bar: "bg-forest-500" },
  error: { icon: "⚠️", ring: "ring-red-400/40", bar: "bg-red-500" },
  info: { icon: "ℹ️", ring: "ring-warm-orange-500/30", bar: "bg-warm-orange-500" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info") => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((list) => [...list, { id, message, type }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove]
  );

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-3 px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const s = STYLES[toast.type] || STYLES.info;
          return (
            <div
              key={toast.id}
              className={`animate-slide-in-right glass-panel pointer-events-auto flex items-stretch overflow-hidden ring-1 ${s.ring}`}
            >
              <div className={`w-1.5 shrink-0 ${s.bar}`} />
              <div className="flex flex-1 items-center gap-3 px-4 py-3">
                <span aria-hidden="true">{s.icon}</span>
                <p className="text-sm font-semibold text-forest-700">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(toast.id)}
                aria-label="Dismiss notification"
                className="px-3 text-forest-600/60 transition-colors hover:text-forest-700"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
