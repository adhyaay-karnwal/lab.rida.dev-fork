"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { cn } from "../utils/cn";

type ToastVariant = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: {
    label: string;
    onClick: () => void;
  };
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export type ToastProviderProps = {
  children: ReactNode;
  duration?: number;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
};

const positionStyles = {
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
  "bottom-right": "bottom-4 right-4",
  "bottom-left": "bottom-4 left-4",
};

const variantStyles: Record<ToastVariant, string> = {
  success: "border-l-4 border-l-success",
  error: "border-l-4 border-l-destructive",
  warning: "border-l-4 border-l-warning",
  info: "border-l-4 border-l-info",
};

type ToastItemProps = {
  toast: Toast;
  onClose: () => void;
};

function ToastItem({ toast, onClose }: ToastItemProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 min-w-[300px] max-w-[400px] p-4 bg-background border border-border shadow-lg",
        variantStyles[toast.variant]
      )}
    >
      <span className="flex-1 text-sm">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={toast.action.onClick}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        onClick={onClose}
        aria-label="Close"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="square" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

type ToastPortalProps = {
  toasts: Toast[];
  position: keyof typeof positionStyles;
  removeToast: (id: string) => void;
};

function ToastPortalContent({ toasts, position, removeToast }: ToastPortalProps) {
  return createPortal(
    <div className={cn("fixed z-50 flex flex-col gap-2", positionStyles[position])}>
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>,
    document.body
  );
}

const ToastPortal = dynamic(() => Promise.resolve(ToastPortalContent), {
  ssr: false,
});

export function ToastProvider({
  children,
  duration = 5000,
  position = "bottom-right",
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...toast, id }]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [duration, removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastPortal toasts={toasts} position={position} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}
