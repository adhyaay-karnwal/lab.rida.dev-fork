import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  error?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, leftIcon, rightIcon, disabled, ...props }, ref) => {
    return (
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            "flex h-10 w-full border border-border bg-background px-3 py-2",
            "text-sm text-foreground",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus-visible:ring-destructive",
            leftIcon && "pl-10",
            rightIcon && "pr-10",
            className
          )}
          disabled={disabled}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {rightIcon}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
