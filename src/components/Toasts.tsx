"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}

interface ToastApi {
  show: (message: string, tone?: Toast["tone"]) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** Short messages in the corner, announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: Toast["tone"] = "info") => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rise pointer-events-auto flex max-w-sm items-start gap-3 border bg-card px-4 py-3 text-sm shadow-[0_2px_0_rgba(18,18,18,0.12)] ${
              toast.tone === "error" ? "border-edited" : "border-ink"
            }`}
          >
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-ink-soft hover:text-ink"
              aria-label="Dismiss message"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M1 1l10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
