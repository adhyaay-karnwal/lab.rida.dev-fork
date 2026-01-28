import { cn } from "../utils/cn";

type SkeletonVariant = "text" | "circle" | "rectangle";

export type SkeletonProps = {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
};

export function Skeleton({
  variant = "rectangle",
  width,
  height,
  className,
}: SkeletonProps) {
  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  return (
    <span
      className={cn(
        "block bg-muted",
        variant === "circle" && "rounded-full",
        variant === "text" && "h-4 w-full",
        variant === "rectangle" && "h-20 w-full",
        className
      )}
      style={style}
    />
  );
}
