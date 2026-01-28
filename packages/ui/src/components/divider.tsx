import { cn } from "../utils/cn";

interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return <hr className={cn("border-0 border-t border-border my-0", className)} />;
}
