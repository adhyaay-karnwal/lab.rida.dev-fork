"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { getAgentApiUrl } from "./acp-session";
import type { ContentPart } from "./acp-types";
import { api } from "./api";
import { useMultiplayer } from "./multiplayer";
import type { Attachment } from "./use-attachments";

export interface MessageState {
  id: string;
  role: "user" | "assistant";
  parts: ContentPart[];
}

interface SendMessageOptions {
  content: string;
  modelId?: string;
  attachments?: Attachment[];
}

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | {
      type: "error";
      message?: string;
      isRetryable?: boolean;
      statusCode?: number;
    };

interface UseAgentResult {
  isLoading: boolean;
  messages: MessageState[];
  error: Error | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  setModel: (modelId: string) => Promise<void>;
  abortSession: () => Promise<void>;
  isSending: boolean;
  sessionStatus: SessionStatus;
  questionRequests: Map<string, string>;
}

interface SessionData {
  sandboxSessionId: string;
}

interface SessionMessagesSnapshot {
  messages: MessageState[];
  questionRequests: [string, string][];
}

function createOptimisticUserMessage(content: string): MessageState {
  return {
    id: `optimistic-user-${Date.now()}`,
    role: "user",
    parts: [{ type: "text", text: content }],
  };
}

function getTextFromMessage(message: MessageState): string {
  return message.parts
    .filter(
      (part): part is Extract<ContentPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

function countUserMessageTexts(messages: MessageState[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const text = getTextFromMessage(message);
    if (!text) {
      continue;
    }
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return counts;
}

async function createSandboxSession(
  labSessionId: string,
  modelId?: string
): Promise<string> {
  const apiUrl = getAgentApiUrl();
  const body: Record<string, string> = {};
  if (modelId) {
    body.model = modelId;
  }

  const response = await fetch(`${apiUrl}/acp/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lab-Session-Id": labSessionId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Failed to create sandbox agent session");
  }

  const data = await response.json();
  return data.id;
}

async function fetchSessionData(
  labSessionId: string
): Promise<SessionData | null> {
  const labSession = await api.sessions.get(labSessionId);
  return { sandboxSessionId: labSession.sandboxSessionId ?? "" };
}

function getAgentSessionKey(labSessionId: string): string {
  return `agent-session-${labSessionId}`;
}

export function useAgent(labSessionId: string): UseAgentResult {
  const { useChannel } = useMultiplayer();
  const { mutate } = useSWRConfig();
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    type: "idle",
  });
  const [optimisticMessages, setOptimisticMessages] = useState<MessageState[]>(
    []
  );
  const sendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingByTextRef = useRef<Map<string, string[]>>(new Map());
  const acknowledgedCountsRef = useRef<Map<string, number>>(new Map());
  const pendingModelUpdateRef = useRef<Promise<void> | null>(null);

  const isOptimisticSession = labSessionId === "new";
  const sessionKey = getAgentSessionKey(labSessionId);

  const {
    data: sessionData,
    error: swrError,
    isLoading,
  } = useSWR<SessionData | null>(
    labSessionId && !isOptimisticSession ? sessionKey : null,
    () => fetchSessionData(labSessionId)
  );

  useEffect(() => {
    if (swrError) {
      setError(
        swrError instanceof Error ? swrError : new Error("Failed to initialize")
      );
    }
  }, [swrError]);

  const snapshot = useChannel(
    "sessionMessages",
    { uuid: labSessionId },
    { enabled: Boolean(labSessionId && !isOptimisticSession) }
  ) as SessionMessagesSnapshot;

  const serverMessages = snapshot.messages;
  const questionRequests = useMemo(
    () => new Map(snapshot.questionRequests),
    [snapshot.questionRequests]
  );

  useEffect(() => {
    const currentCounts = countUserMessageTexts(serverMessages);
    const acknowledged = new Map(acknowledgedCountsRef.current);
    const resolvedOptimisticIds = new Set<string>();

    for (const [text, pendingIds] of pendingByTextRef.current.entries()) {
      const seenCount = currentCounts.get(text) ?? 0;
      const alreadyAcked = acknowledged.get(text) ?? 0;
      const newlyAckedCount = Math.max(0, seenCount - alreadyAcked);
      if (newlyAckedCount <= 0) {
        continue;
      }

      const resolvedIds = pendingIds.slice(0, newlyAckedCount);
      for (const id of resolvedIds) {
        resolvedOptimisticIds.add(id);
      }

      const remainingIds = pendingIds.slice(newlyAckedCount);
      if (remainingIds.length > 0) {
        pendingByTextRef.current.set(text, remainingIds);
      } else {
        pendingByTextRef.current.delete(text);
      }
      acknowledged.set(text, alreadyAcked + newlyAckedCount);
    }

    if (resolvedOptimisticIds.size > 0) {
      setOptimisticMessages((previous) =>
        previous.filter((message) => !resolvedOptimisticIds.has(message.id))
      );
    }

    acknowledgedCountsRef.current = currentCounts;
  }, [serverMessages]);

  useEffect(() => {
    if (serverMessages.some((message) => message.role === "assistant")) {
      setSessionStatus((previous) =>
        previous.type === "busy" ? { type: "idle" } : previous
      );
      setIsSending(false);
      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
        sendingTimeoutRef.current = null;
      }
    }
  }, [serverMessages]);

  const mergedMessages = useMemo(
    () => [...serverMessages, ...optimisticMessages],
    [serverMessages, optimisticMessages]
  );

  const sandboxSessionId = sessionData?.sandboxSessionId ?? null;

  const sendMessage = async ({ content, modelId }: SendMessageOptions) => {
    setError(null);
    setIsSending(true);
    setSessionStatus({ type: "busy" });

    const optimisticMessage = createOptimisticUserMessage(content);
    setOptimisticMessages((previous) => [...previous, optimisticMessage]);
    const existingPendingIds = pendingByTextRef.current.get(content) ?? [];
    pendingByTextRef.current.set(content, [
      ...existingPendingIds,
      optimisticMessage.id,
    ]);

    if (sendingTimeoutRef.current) {
      clearTimeout(sendingTimeoutRef.current);
    }

    sendingTimeoutRef.current = setTimeout(
      () => {
        setIsSending(false);
        setSessionStatus({ type: "idle" });
        sendingTimeoutRef.current = null;
      },
      5 * 60 * 1000
    );

    const ensureActiveSandboxSessionId = async (): Promise<string> => {
      if (sandboxSessionId) {
        return sandboxSessionId;
      }

      const newSandboxSessionId = await createSandboxSession(
        labSessionId,
        modelId
      );

      mutate(
        sessionKey,
        (): SessionData => ({ sandboxSessionId: newSandboxSessionId }),
        { revalidate: false }
      );
      mutate(`session-${labSessionId}`);
      return newSandboxSessionId;
    };

    try {
      if (pendingModelUpdateRef.current) {
        await pendingModelUpdateRef.current;
      }

      const activeSandboxSessionId = await ensureActiveSandboxSessionId();
      const apiUrl = getAgentApiUrl();
      const response = await fetch(`${apiUrl}/acp/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lab-Session-Id": labSessionId,
        },
        body: JSON.stringify({
          sessionId: activeSandboxSessionId,
          message: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }
    } catch (sendError) {
      const pendingIds = pendingByTextRef.current.get(content) ?? [];
      const remaining = pendingIds.filter((id) => id !== optimisticMessage.id);
      if (remaining.length > 0) {
        pendingByTextRef.current.set(content, remaining);
      } else {
        pendingByTextRef.current.delete(content);
      }

      setOptimisticMessages((previous) =>
        previous.filter((message) => message.id !== optimisticMessage.id)
      );
      setIsSending(false);
      setSessionStatus({ type: "error", message: "Failed to send message" });

      const errorInstance =
        sendError instanceof Error
          ? sendError
          : new Error("Failed to send message");
      setError(errorInstance);
      throw errorInstance;
    }
  };

  const setModel = async (modelId: string) => {
    if (!(modelId && sandboxSessionId)) {
      return;
    }

    const apiUrl = getAgentApiUrl();
    const modelUpdatePromise = fetch(`${apiUrl}/acp/model`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lab-Session-Id": labSessionId,
      },
      body: JSON.stringify({
        sessionId: sandboxSessionId,
        model: modelId,
      }),
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to set model: ${response.status}`);
      }
    });

    pendingModelUpdateRef.current = modelUpdatePromise;
    try {
      await modelUpdatePromise;
    } finally {
      if (pendingModelUpdateRef.current === modelUpdatePromise) {
        pendingModelUpdateRef.current = null;
      }
    }
  };

  const abortSession = async () => {
    if (!sandboxSessionId) {
      return;
    }

    try {
      const apiUrl = getAgentApiUrl();
      await fetch(`${apiUrl}/acp/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lab-Session-Id": labSessionId,
        },
      });
      setIsSending(false);
      setSessionStatus({ type: "idle" });
    } catch (abortError) {
      console.warn("Failed to abort session:", abortError);
    }
  };

  return {
    isLoading,
    messages: mergedMessages,
    error,
    sendMessage,
    setModel,
    abortSession,
    isSending,
    sessionStatus,
    questionRequests,
  };
}
