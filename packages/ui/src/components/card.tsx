import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  border?: boolean;
  shadow?: boolean;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, border = true, shadow = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-background",
          border && "border border-border",
          shadow && "shadow-md",
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
});

CardHeader.displayName = "CardHeader";

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />;
});

CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex items-center p-4 pt-0", className)}
      {...props}
    />
  );
});

CardFooter.displayName = "CardFooter";
