"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/cn";
import { Button, type ButtonProps } from "./button";

type AlertDialogContextValue = {
  onClose: () => void;
};

const AlertDialogContext = createContext<AlertDialogContextValue | null>(null);

function useAlertDialog() {
  const context = useContext(AlertDialogContext);
  if (!context) throw new Error("AlertDialog components must be used within AlertDialog");
  return context;
}

export type AlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  const onClose = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <AlertDialogContext.Provider value={{ onClose }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        {children}
      </div>
    </AlertDialogContext.Provider>,
    document.body,
  );
}

export type AlertDialogContentProps = {
  children: ReactNode;
  className?: string;
};

export function AlertDialogContent({ children, className }: AlertDialogContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  return (
    <div
      ref={contentRef}
      role="alertdialog"
      tabIndex={-1}
      className={cn(
        "relative z-50 w-full max-w-sm bg-background border border-border p-4 shadow-lg",
        "focus:outline-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type AlertDialogTitleProps = {
  children: ReactNode;
  className?: string;
};

export function AlertDialogTitle({ children, className }: AlertDialogTitleProps) {
  return <h2 className={cn("text-sm font-medium text-foreground", className)}>{children}</h2>;
}

export type AlertDialogDescriptionProps = {
  children: ReactNode;
  className?: string;
};

export function AlertDialogDescription({ children, className }: AlertDialogDescriptionProps) {
  return <p className={cn("mt-2 text-xs text-muted-foreground", className)}>{children}</p>;
}

export type AlertDialogActionsProps = {
  children: ReactNode;
  className?: string;
};

export function AlertDialogActions({ children, className }: AlertDialogActionsProps) {
  return <div className={cn("mt-4 flex justify-end gap-2", className)}>{children}</div>;
}

export type AlertDialogCancelProps = Omit<ButtonProps, "variant"> & {
  children: ReactNode;
};

export function AlertDialogCancel({ children, onClick, ...props }: AlertDialogCancelProps) {
  const { onClose } = useAlertDialog();

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    onClose();
  };

  return (
    <Button variant="secondary" onClick={handleClick} {...props}>
      {children}
    </Button>
  );
}

export type AlertDialogActionProps = Omit<ButtonProps, "variant"> & {
  children: ReactNode;
  variant?: "primary" | "destructive";
};

export function AlertDialogAction({
  children,
  variant = "primary",
  className,
  onClick,
  ...props
}: AlertDialogActionProps) {
  const { onClose } = useAlertDialog();

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    onClose();
  };

  const isDestructive = variant === "destructive";

  return (
    <Button
      variant="primary"
      onClick={handleClick}
      className={cn(isDestructive && "bg-destructive hover:bg-destructive/90", className)}
      {...props}
    >
      {children}
    </Button>
  );
}
