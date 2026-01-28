"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { useClickOutside } from "../hooks/use-click-outside";
import { useControllable } from "../hooks/use-controllable";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  renderOption?: (option: SelectOption) => ReactNode;
  className?: string;
};

export function Select({
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  placeholder = "Select...",
  disabled = false,
  searchable = false,
  renderOption,
  className,
}: SelectProps) {
  const [value, setValue] = useControllable({
    value: controlledValue,
    defaultValue,
    onChange,
  });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useClickOutside<HTMLDivElement>(() => {
    setOpen(false);
    setSearch("");
  }, open);

  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (open && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, searchable]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (open && activeIndex >= 0) {
          const opt = filteredOptions[activeIndex];
          if (opt && !opt.disabled) {
            setValue(opt.value);
            setOpen(false);
            setSearch("");
          }
        } else {
          setOpen(true);
        }
        break;
      case "Escape":
        setOpen(false);
        setSearch("");
        break;
    }
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between border border-border bg-background px-3 py-2",
          "text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selectedOption && "text-muted-foreground"
        )}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className="h-4 w-4 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="square" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full bg-background border border-border shadow-md">
          {searchable && (
            <div className="border-b border-border p-2">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
          )}
          <div role="listbox" className="max-h-60 overflow-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No options
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={cn(
                    "flex w-full items-center px-3 py-2 text-sm text-left",
                    "hover:bg-muted focus:bg-muted focus:outline-none",
                    option.value === value && "bg-muted",
                    index === activeIndex && "bg-muted",
                    option.disabled && "pointer-events-none opacity-50"
                  )}
                  onClick={() => {
                    if (!option.disabled) {
                      setValue(option.value);
                      setOpen(false);
                      setSearch("");
                    }
                  }}
                  disabled={option.disabled}
                >
                  {renderOption ? renderOption(option) : option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
