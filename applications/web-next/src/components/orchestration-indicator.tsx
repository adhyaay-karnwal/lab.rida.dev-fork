"use client";

import { Loader2 } from "lucide-react";

type OrchestrationStatus = "idle" | "thinking" | "delegating" | "starting";

type OrchestrationIndicatorProps = {
  status: OrchestrationStatus;
  projectName?: string;
};

const statusMessages: Record<OrchestrationStatus, string> = {
  idle: "",
  thinking: "Understanding your request...",
  delegating: "Identifying the right project...",
  starting: "Starting session...",
};

export function OrchestrationIndicator({ status, projectName }: OrchestrationIndicatorProps) {
  if (status === "idle") return null;

  const message =
    status === "starting" && projectName
      ? `Starting session in ${projectName}...`
      : statusMessages[status];

  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-bg border border-border text-sm text-text-secondary pointer-events-auto">
      <Loader2 size={14} className="animate-spin" />
      <span>{message}</span>
    </div>
  );
}

export type { OrchestrationStatus };
