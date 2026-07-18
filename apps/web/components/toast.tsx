"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Toast system.
 *
 * <ToastProvider> wraps the app once (in (app)/layout.tsx).
 * Anywhere inside, `useToast()` exposes:
 *   toast.success('Trade placed')
 *   toast.info('Following @alphamamba')
 *   toast.error('Something went wrong')
 *
 * Toasts auto-dismiss after 4 seconds; hover to pause; Esc to clear all.
 */

export type ToastKind = "success" | "info" | "error" | "warning";

export interface Toast {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
  readonly description?: string;
  readonly createdAt: number;
}

interface ToastApi {
  success: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 4_000;

export function ToastProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const pausedRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    pausedRef.current.delete(id);
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, description?: string) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const toast: Toast = {
        id,
        kind,
        message,
        createdAt: Date.now(),
        ...(description !== undefined ? { description } : {}),
      };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        if (!pausedRef.current.has(id)) dismiss(id);
      }, AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, d) => {
        push("success", m, d);
      },
      info: (m, d) => {
        push("info", m, d);
      },
      error: (m, d) => {
        push("error", m, d);
      },
      warning: (m, d) => {
        push("warning", m, d);
      },
      dismiss,
    }),
    [push, dismiss],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setToasts([]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastTray
        toasts={toasts}
        onDismiss={dismiss}
        onPauseChange={(id, paused) => {
          if (paused) pausedRef.current.add(id);
          else pausedRef.current.delete(id);
        }}
      />
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastCtx);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

// ---------------------------------------------------------------------------

function ToastTray({
  toasts,
  onDismiss,
  onPauseChange,
}: {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: string) => void;
  readonly onPauseChange: (id: string, paused: boolean) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6"
      role="region"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={() => {
            onDismiss(t.id);
          }}
          onMouseEnter={() => {
            onPauseChange(t.id, true);
          }}
          onMouseLeave={() => {
            onPauseChange(t.id, false);
          }}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}: {
  readonly toast: Toast;
  readonly onDismiss: () => void;
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
}) {
  const kindStyles: Record<ToastKind, { border: string; text: string }> = {
    success: { border: "border-pnl-long/40", text: "text-pnl-long" },
    info: { border: "border-accent/40", text: "text-accent" },
    error: { border: "border-pnl-short/40", text: "text-pnl-short" },
    warning: { border: "border-alert-orange/40", text: "text-alert-orange" },
  };
  const k = kindStyles[toast.kind];

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-klub border ${k.border} bg-bg-elevated p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur`}
    >
      <span className={`mt-0.5 ${k.text}`} aria-hidden>
        {toast.kind === "success" && (
          <CheckCircle2 size={17} strokeWidth={1.8} />
        )}
        {toast.kind === "info" && <Info size={17} strokeWidth={1.8} />}
        {toast.kind === "error" && <XCircle size={17} strokeWidth={1.8} />}
        {toast.kind === "warning" && (
          <AlertTriangle size={17} strokeWidth={1.8} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg-primary">
          {toast.message}
        </div>
        {toast.description && (
          <div className="mt-1 text-[13px] leading-relaxed text-fg-secondary">
            {toast.description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-fg-muted transition-colors hover:text-fg-primary"
      >
        <X size={16} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}
