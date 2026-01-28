import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { Slot } from "../utils/slot";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "link";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-80",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  link: "underline-offset-4 hover:underline text-primary",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      asChild = false,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          variant !== "link" && sizeStyles[size],
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading ? <Spinner size="sm" /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </Comp>
    );
  }
);

Button.displayName = "Button";
