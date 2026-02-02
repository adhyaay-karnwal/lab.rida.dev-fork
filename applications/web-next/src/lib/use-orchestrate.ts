"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "./api";
import { useMultiplayer } from "./multiplayer";
import type { schema } from "@lab/multiplayer-sdk";
import type { z } from "zod";

type ChannelStatus = z.infer<typeof schema.channels.orchestrationStatus.snapshot>["status"];
export type OrchestrationStatus = "idle" | ChannelStatus;

export interface OrchestrationState {
  status: OrchestrationStatus;
  projectName: string | null;
  sessionId: string | null;
  errorMessage: string | null;
  orchestrationId: string | null;
}

interface UseOrchestrateResult {
  state: OrchestrationState;
  submit: (content: string, options?: { channelId?: string; modelId?: string }) => Promise<void>;
  reset: () => void;
  isLoading: boolean;
}

const initialState: OrchestrationState = {
  status: "idle",
  projectName: null,
  sessionId: null,
  errorMessage: null,
  orchestrationId: null,
};

export function useOrchestrate(): UseOrchestrateResult {
  const multiplayer = useMultiplayer();
  const [state, setState] = useState<OrchestrationState>(initialState);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const isLoading =
    state.status === "pending" ||
    state.status === "thinking" ||
    state.status === "delegating" ||
    state.status === "starting";

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setState(initialState);
  }, []);

  const submit = useCallback(
    async (content: string, options?: { channelId?: string; modelId?: string }) => {
      reset();
      setState({
        status: "pending",
        projectName: null,
        sessionId: null,
        errorMessage: null,
        orchestrationId: null,
      });

      try {
        const result = await api.orchestrate({
          content,
          channelId: options?.channelId,
          modelId: options?.modelId,
        });

        const unsubscribe = multiplayer.subscribe(
          "orchestrationStatus",
          { uuid: result.orchestrationId },
          (snapshot) => {
            setState((prev) => ({
              ...prev,
              status: snapshot.status,
              projectName: snapshot.projectName,
              sessionId: snapshot.sessionId,
              errorMessage: snapshot.errorMessage,
            }));
          },
        );

        unsubscribeRef.current = unsubscribe;

        setState((prev) => ({
          ...prev,
          orchestrationId: result.orchestrationId,
          projectName: result.projectName,
          sessionId: result.sessionId,
          status: "complete",
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Orchestration failed";
        setState({
          status: "error",
          projectName: null,
          sessionId: null,
          errorMessage,
          orchestrationId: null,
        });
      }
    },
    [multiplayer, reset],
  );

  return {
    state,
    submit,
    reset,
    isLoading,
  };
}
