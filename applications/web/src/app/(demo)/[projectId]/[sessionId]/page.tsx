"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { SessionView } from "@/components/session-view";
import { SessionSidebar } from "@/components/session-sidebar";
import type { ReviewableFile } from "@/types/review";
import { useMultiplayer } from "@/lib/multiplayer/client";

export default function SessionPage() {
  const params = useParams();
  const sessionId =
    typeof params.sessionId === "string" ? params.sessionId : (params.sessionId?.[0] ?? "");

  const { send, connectionState, useChannel } = useMultiplayer();

  const messagesState = useChannel("sessionMessages", { uuid: sessionId });
  const filesState = useChannel("sessionChangedFiles", { uuid: sessionId });
  const branchesState = useChannel("sessionBranches", { uuid: sessionId });
  const linksState = useChannel("sessionLinks", { uuid: sessionId });
  const promptEngineersState = useChannel("sessionPromptEngineers", { uuid: sessionId });
  const logsState = useChannel("sessionLogs", { uuid: sessionId });

  const [localReviewFiles, setLocalReviewFiles] = useState<ReviewableFile[]>([]);

  const messages = messagesState.status === "connected" ? messagesState.data : [];
  const reviewFiles = filesState.status === "connected" ? filesState.data : localReviewFiles;
  const branches = branchesState.status === "connected" ? branchesState.data : [];
  const links = linksState.status === "connected" ? linksState.data : [];
  const promptEngineers =
    promptEngineersState.status === "connected" ? promptEngineersState.data : [];
  const logSources = logsState.status === "connected" ? logsState.data : [];

  const handleSendMessage = (content: string) => {
    send(sessionId, { type: "send_message", content });
  };

  const handleTyping = (isTyping: boolean) => {
    send(sessionId, { type: "set_typing", isTyping });
  };

  const handleDismissFile = (path: string) => {
    setLocalReviewFiles((files) =>
      files.map((f) => (f.path === path ? { ...f, status: "dismissed" as const } : f)),
    );
  };

  if (connectionState.status === "connecting" || connectionState.status === "reconnecting") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connecting...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <SessionView
        messages={messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))}
        reviewFiles={reviewFiles}
        onDismissFile={handleDismissFile}
      />
      <SessionSidebar
        promptEngineers={promptEngineers}
        branches={branches}
        tasks={[]}
        links={links}
        containers={[]}
        logSources={logSources.map((source) => ({
          id: source.id,
          name: source.name,
          logs: [],
        }))}
        reviewFiles={reviewFiles}
        onDismissFile={handleDismissFile}
      />
    </div>
  );
}
