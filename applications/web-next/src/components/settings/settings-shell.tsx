"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { tv } from "tailwind-variants";
import { settingsTabs } from "@/config/settings";

const tab = tv({
  base: "px-3 py-1 text-xs border-b-2 -mb-px",
  variants: {
    active: {
      true: "border-text text-text",
      false: "border-transparent text-text-muted hover:text-text",
    },
  },
});

function SettingsTabs() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/settings/projects") {
      return pathname.startsWith("/settings/projects");
    }
    return pathname === href;
  };

  return (
    <div className="flex border-b border-border">
      {settingsTabs.map((t) => (
        <Link key={t.href} href={t.href} className={tab({ active: isActive(t.href) })}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

type SettingsShellProps = {
  children: ReactNode;
};

export function SettingsShell({ children }: SettingsShellProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <SettingsTabs />
      {children}
    </div>
  );
}
