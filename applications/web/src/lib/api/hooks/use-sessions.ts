"use client";

import { useState, useCallback } from "react";
import type { Session } from "@lab/client";
import { useApiClient } from "../client";

interface UseCreateSessionResult {
  createSession: () => Promise<Session>;
  isLoading: boolean;
  error: Error | null;
}

export function useCreateSession(projectId: string): UseCreateSessionResult {
  const client = useApiClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createSession = useCallback(async (): Promise<Session> => {
    setIsLoading(true);
    setError(null);
    try {
      return await client.sessions.create(projectId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create session");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [client, projectId]);

  return { createSession, isLoading, error };
}

interface UseDeleteSessionResult {
  deleteSession: (sessionId: string) => Promise<void>;
  isDeleting: boolean;
  error: Error | null;
}

export function useDeleteSession(): UseDeleteSessionResult {
  const client = useApiClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      setIsDeleting(true);
      setError(null);
      try {
        await client.sessions.delete(sessionId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to delete session");
        setError(error);
        throw error;
      } finally {
        setIsDeleting(false);
      }
    },
    [client],
  );

  return { deleteSession, isDeleting, error };
}
