import type { ReactNode } from "react";
import { Copy } from "./copy";

export interface FormFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function FormField({ label, hint, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <Copy size="sm" className="font-medium">
          {label}
        </Copy>
        {hint && (
          <Copy size="xs" muted>
            {hint}
          </Copy>
        )}
      </div>
      {children}
    </div>
  );
}
