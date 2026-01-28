"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { cn } from "../utils/cn";
import { useControllable } from "../hooks/use-controllable";

type TabsContextValue = {
  value: string | undefined;
  setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be used within Tabs");
  return context;
}

export type TabsProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
};

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [value, setValue] = useControllable({
    value: controlledValue,
    defaultValue,
    onChange: onValueChange,
  });

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export type TabsListProps = {
  children: ReactNode;
  className?: string;
};

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center border-b border-border",
        className
      )}
    >
      {children}
    </div>
  );
}

export type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function TabsTrigger({
  value,
  className,
  children,
  disabled,
  ...props
}: TabsTriggerProps) {
  const { value: selectedValue, setValue } = useTabs();
  const isSelected = value === selectedValue;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        "inline-flex items-center justify-center px-4 py-2 text-sm font-medium -mb-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        isSelected
          ? "border-b-2 border-foreground text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={() => setValue(value)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export type TabsContentProps = {
  value: string;
  children: ReactNode;
  className?: string;
  lazy?: boolean;
};

export function TabsContent({
  value,
  children,
  className,
  lazy = false,
}: TabsContentProps) {
  const { value: selectedValue } = useTabs();
  const [hasRendered, setHasRendered] = useState(false);
  const isSelected = value === selectedValue;

  if (isSelected && !hasRendered) {
    setHasRendered(true);
  }

  if (lazy && !hasRendered) return null;
  if (!isSelected) return null;

  return (
    <div role="tabpanel" className={cn("mt-4", className)}>
      {children}
    </div>
  );
}
