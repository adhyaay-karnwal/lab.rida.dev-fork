"use client";

import type { Session } from "@lab/client";
import { useMultiplayer } from "./multiplayer";

export type SessionStatus = "starting" | "running" | "generating" | "error" | "deleting";

type SessionContainer = {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  urls: { port: number; url: string }[];
};

export function useSessionStatus(session: Session): SessionStatus {
  const { useChannel } = useMultiplayer();
  const containers: SessionContainer[] = useChannel("sessionContainers", { uuid: session.id });
  const metadata = useChannel("sessionMetadata", { uuid: session.id });

  if ((session.status as string) === "deleting") {
    return "deleting";
  }

  const hasStartingContainer = containers.some((container) => container.status === "starting");
  if (hasStartingContainer || session.status === "creating") {
    return "starting";
  }

  const hasErrorContainer = containers.some((container) => container.status === "error");
  if (hasErrorContainer) {
    return "error";
  }

  if (metadata.inferenceStatus === "generating") {
    return "generating";
  }

  return "running";
}
