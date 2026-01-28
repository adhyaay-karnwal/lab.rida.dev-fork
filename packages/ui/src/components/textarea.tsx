import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../utils/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
  autoResize?: boolean;
  maxHeight?: number;
  showCount?: boolean;
  maxLength?: number;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error,
      autoResize = false,
      maxHeight,
      showCount = false,
      maxLength,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => internalRef.current!, []);

    useEffect(() => {
      if (!autoResize || !internalRef.current) return;

      const textarea = internalRef.current;
      textarea.style.height = "auto";
      const newHeight = maxHeight
        ? Math.min(textarea.scrollHeight, maxHeight)
        : textarea.scrollHeight;
      textarea.style.height = `${newHeight}px`;
    }, [autoResize, maxHeight, value]);

    const currentLength = typeof value === "string" ? value.length : 0;

    return (
      <div className="relative">
        <textarea
          ref={internalRef}
          className={cn(
            "flex min-h-[80px] w-full border border-border bg-background px-3 py-2",
            "text-sm text-foreground",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none",
            error && "border-destructive focus-visible:ring-destructive",
            showCount && "pb-6",
            className
          )}
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          {...props}
        />
        {showCount && (
          <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
            {currentLength}
            {maxLength && `/${maxLength}`}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
