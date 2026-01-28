"use client";

import { useState, useRef, type ReactNode } from "react";
import { cn } from "../utils/cn";

type TooltipPosition = "top" | "right" | "bottom" | "left";

export type TooltipProps = {
  content: ReactNode;
  position?: TooltipPosition;
  delay?: number;
  arrow?: boolean;
  children: ReactNode;
  className?: string;
};

const positionStyles: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
};

const arrowStyles: Record<TooltipPosition, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-foreground border-x-transparent border-b-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-foreground border-y-transparent border-l-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-foreground border-x-transparent border-t-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-foreground border-y-transparent border-r-transparent",
};

export function Tooltip({
  content,
  position = "top",
  delay = 200,
  arrow = true,
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 px-2 py-1 text-xs bg-foreground text-background whitespace-nowrap",
            positionStyles[position],
            className
          )}
        >
          {content}
          {arrow && (
            <span
              className={cn(
                "absolute border-4",
                arrowStyles[position]
              )}
            />
          )}
        </span>
      )}
    </span>
  );
}
