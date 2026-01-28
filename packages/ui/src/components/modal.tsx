"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/cn";
import { useFocusTrap } from "../hooks/use-focus-trap";
import { useEscapeKey } from "../hooks/use-keyboard";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
  className?: string;
};

export function Modal({
  open,
  onClose,
  closeOnOverlay = true,
  closeOnEscape = true,
  children,
  className,
}: ModalProps) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);
  useEscapeKey(onClose, open && closeOnEscape);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlay) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full max-w-lg bg-background border border-border shadow-lg",
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export const ModalHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-1.5 p-4 border-b border-border",
        className
      )}
      {...props}
    />
  );
});

ModalHeader.displayName = "ModalHeader";

export const ModalContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn("p-4", className)} {...props} />;
});

ModalContent.displayName = "ModalContent";

export const ModalFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-end gap-2 p-4 border-t border-border",
        className
      )}
      {...props}
    />
  );
});

ModalFooter.displayName = "ModalFooter";
