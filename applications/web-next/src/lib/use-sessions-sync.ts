"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { useMultiplayer } from "./multiplayer";
import type { Session } from "@lab/client";

interface MultiplayerSession {
  id: string;
  projectId: string;
  title: string | null;
  hasUnread?: boolean;
  isWorking?: boolean;
}

function toSession(mp: MultiplayerSession): Session {
  return {
    id: mp.id,
    projectId: mp.projectId,
    title: mp.title,
    opencodeSessionId: null,
    status: "idle",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function useSessionsSync() {
  const { mutate } = useSWRConfig();
  const { useChannel } = useMultiplayer();

  const sessions = useChannel("sessions");

  useEffect(() => {
    if (!sessions || sessions.length === 0) return;

    const sessionsByProject = new Map<string, Session[]>();

    for (const session of sessions) {
      const existing = sessionsByProject.get(session.projectId) ?? [];
      existing.push(toSession(session));
      sessionsByProject.set(session.projectId, existing);
    }

    for (const [projectId, projectSessions] of sessionsByProject) {
      const cacheKey = `sessions-${projectId}`;

      mutate(
        cacheKey,
        (current: Session[] | undefined) => {
          if (!current) return projectSessions;

          const currentIds = new Set(current.map((session) => session.id));
          const newSessions: Session[] = [];

          for (const session of projectSessions) {
            if (!currentIds.has(session.id)) {
              newSessions.push(session);
            }
          }

          if (newSessions.length === 0) return current;

          return [...current, ...newSessions];
        },
        false,
      );
    }
  }, [sessions, mutate]);
}
