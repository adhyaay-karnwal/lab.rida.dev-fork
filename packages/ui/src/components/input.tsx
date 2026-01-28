import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, mono, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex-1 bg-muted border border-border px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground",
          mono && "font-mono",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
