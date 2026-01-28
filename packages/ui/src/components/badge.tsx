import { type HTMLAttributes } from "react";
import { cn } from "../utils/cn";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";
type BadgeSize = "sm" | "md";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
};

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  error: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
};

const dotVariantStyles: Record<BadgeVariant, string> = {
  default: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  info: "bg-info",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-0.5 text-xs",
};

export function Badge({
  className,
  variant = "default",
  size = "md",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dotVariantStyles[variant])}
        />
      )}
      {children}
    </span>
  );
}
