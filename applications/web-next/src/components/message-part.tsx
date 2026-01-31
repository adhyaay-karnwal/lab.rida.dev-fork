"use client";

import type { ReactNode } from "react";
import type {
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,
} from "@opencode-ai/sdk/client";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { tv } from "tailwind-variants";
import { Markdown } from "./markdown";
import { cn } from "@/lib/cn";
import {
  isTextPart,
  isReasoningPart,
  isToolPart,
  isFilePart,
  isStepStartPart,
  isStepFinishPart,
  isSnapshotPart,
  isPatchPart,
  isAgentPart,
  isSubtaskPart,
  isRetryPart,
  isCompactionPart,
  type SubtaskPart,
} from "@/lib/opencode";

const contentBlock = tv({
  base: "px-4 py-3 text-sm",
});

function MessagePartText({ part, isStreaming }: { part: TextPart; isStreaming?: boolean }) {
  return (
    <div className={contentBlock()}>
      <Markdown isStreaming={isStreaming}>{part.text}</Markdown>
    </div>
  );
}

function MessagePartReasoning({ part }: { part: ReasoningPart }) {
  return (
    <div className={cn(contentBlock(), "text-text-muted italic")}>
      <Markdown>{part.text}</Markdown>
    </div>
  );
}

const actionRow = tv({
  base: "flex items-center gap-2 px-4 py-2 text-sm",
});

const toolStatus = tv({
  base: "",
  variants: {
    status: {
      pending: "text-text-muted",
      running: "text-text-muted animate-spin",
      completed: "text-green-500",
      error: "text-red-500",
    },
  },
});

function MessagePartTool({ part, children }: { part: ToolPart; children?: ReactNode }) {
  const status = part.state.status;
  const title = "title" in part.state ? part.state.title : part.tool;
  const duration =
    status === "completed" || status === "error"
      ? part.state.time.end - part.state.time.start
      : null;

  return (
    <div>
      <div className={cn(actionRow(), "cursor-pointer hover:bg-bg-hover")}>
        {(status === "running" || status === "pending") && (
          <Loader2 size={14} className={toolStatus({ status: "running" })} />
        )}
        {status === "completed" && <Check size={14} className={toolStatus({ status })} />}
        {status === "error" && <span className={toolStatus({ status })}>✕</span>}
        <span className="flex-1">{title}</span>
        {duration !== null && <span className="text-xs text-text-muted">{duration}ms</span>}
        <ChevronRight size={14} className="text-text-muted" />
      </div>
      {children}
    </div>
  );
}

const detailBlock = tv({
  base: "px-4 py-2 text-xs bg-bg-muted overflow-x-auto font-mono",
});

function MessagePartToolInput({ input }: { input: Record<string, unknown> }) {
  return <pre className={detailBlock()}>{JSON.stringify(input, null, 2)}</pre>;
}

function MessagePartToolOutput({ output }: { output: string }) {
  return <pre className={cn(detailBlock(), "max-h-40 overflow-y-auto")}>{output}</pre>;
}

function MessagePartToolError({ error }: { error: string }) {
  return <div className={cn(detailBlock(), "text-red-500")}>{error}</div>;
}

function MessagePartFile({ part }: { part: FilePart }) {
  return (
    <div className={actionRow()}>
      <span>{part.filename || part.url}</span>
      {part.source && "path" in part.source && (
        <span className="text-text-muted">{part.source.path}</span>
      )}
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

const metaRow = tv({
  base: "flex items-center gap-3 px-4 py-1.5 text-xs text-text-muted",
});

function MessagePartStepStart({ part }: { part: StepStartPart }) {
  return (
    <div className={metaRow()}>
      <span>Step started</span>
      {part.snapshot && <span className="font-mono">{part.snapshot.slice(0, 8)}</span>}
    </div>
  );
}

function MessagePartStepFinish({ part }: { part: StepFinishPart }) {
  return (
    <div className={metaRow()}>
      <span>{part.reason}</span>
      <span>
        {part.tokens.input.toLocaleString()}↓ {part.tokens.output.toLocaleString()}↑
      </span>
      {part.tokens.reasoning > 0 && <span>{part.tokens.reasoning.toLocaleString()} reasoning</span>}
      {part.cost > 0 && <span>${part.cost.toFixed(4)}</span>}
    </div>
  );
}

function MessagePartSnapshot({ part }: { part: SnapshotPart }) {
  return (
    <div className={metaRow()}>
      <span>Snapshot</span>
      <span className="font-mono">{part.id.slice(0, 8)}</span>
    </div>
  );
}

function MessagePartPatch({ part }: { part: PatchPart }) {
  return (
    <div className={metaRow()}>
      <span>Patch applied</span>
    </div>
  );
}

function MessagePartAgent({ part }: { part: AgentPart }) {
  return (
    <div className={actionRow()}>
      <Loader2 size={14} className="text-text-muted animate-spin" />
      <span>Agent task</span>
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

function MessagePartSubtask({ part }: { part: SubtaskPart }) {
  return (
    <div className={actionRow()}>
      <Loader2 size={14} className="text-text-muted animate-spin" />
      <span>{part.description}</span>
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

function MessagePartRetry({ part }: { part: RetryPart }) {
  return (
    <div className={cn(actionRow(), "text-yellow-500")}>
      <Loader2 size={14} className="animate-spin" />
      <span>Retrying...</span>
    </div>
  );
}

function MessagePartCompaction({ part }: { part: CompactionPart }) {
  return (
    <div className={metaRow()}>
      <span>Context compacted</span>
    </div>
  );
}

function MessagePartRoot({
  part,
  isStreaming,
  children,
}: {
  part: Part;
  isStreaming?: boolean;
  children?: ReactNode;
}) {
  if (children) {
    return <>{children}</>;
  }

  if (isTextPart(part)) {
    return <MessagePartText part={part} isStreaming={isStreaming} />;
  }

  if (isReasoningPart(part)) {
    return <MessagePartReasoning part={part} />;
  }

  if (isToolPart(part)) {
    return <MessagePartTool part={part} />;
  }

  if (isFilePart(part)) {
    return <MessagePartFile part={part} />;
  }

  if (isStepStartPart(part)) {
    return <MessagePartStepStart part={part} />;
  }

  if (isStepFinishPart(part)) {
    return <MessagePartStepFinish part={part} />;
  }

  if (isSnapshotPart(part)) {
    return <MessagePartSnapshot part={part} />;
  }

  if (isPatchPart(part)) {
    return <MessagePartPatch part={part} />;
  }

  if (isAgentPart(part)) {
    return <MessagePartAgent part={part} />;
  }

  if (isSubtaskPart(part)) {
    return <MessagePartSubtask part={part} />;
  }

  if (isRetryPart(part)) {
    return <MessagePartRetry part={part} />;
  }

  if (isCompactionPart(part)) {
    return <MessagePartCompaction part={part} />;
  }

  return null;
}

const MessagePart = {
  Root: MessagePartRoot,
  Text: MessagePartText,
  Reasoning: MessagePartReasoning,
  Tool: MessagePartTool,
  ToolInput: MessagePartToolInput,
  ToolOutput: MessagePartToolOutput,
  ToolError: MessagePartToolError,
  File: MessagePartFile,
  StepStart: MessagePartStepStart,
  StepFinish: MessagePartStepFinish,
  Snapshot: MessagePartSnapshot,
  Patch: MessagePartPatch,
  Agent: MessagePartAgent,
  Subtask: MessagePartSubtask,
  Retry: MessagePartRetry,
  Compaction: MessagePartCompaction,
};

export { MessagePart };
