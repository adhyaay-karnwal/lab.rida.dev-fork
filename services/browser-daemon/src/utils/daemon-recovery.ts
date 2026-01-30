import {
  isDaemonRunning,
  cleanupSocket,
  getSocketDir,
  getStreamPortFile,
} from "agent-browser";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { DaemonSession } from "../types/daemon";

export interface RecoveryCallbacks {
  onRecover: (sessionId: string, streamPort: number, cdpPort?: number) => void;
}

function getCdpPortFile(sessionId: string): string {
  return `${getSocketDir()}/${sessionId}.cdp`;
}

export function recoverSession(sessionId: string, callbacks: RecoveryCallbacks): DaemonSession | null {
  try {
    const streamPortPath = getStreamPortFile(sessionId);
    if (!existsSync(streamPortPath)) {
      console.debug(`[DaemonRecovery] Cannot recover ${sessionId}: no stream port file`);
      return null;
    }

    const streamPort = parseInt(readFileSync(streamPortPath, "utf-8").trim(), 10);
    if (isNaN(streamPort)) {
      console.debug(`[DaemonRecovery] Cannot recover ${sessionId}: invalid port in file`);
      return null;
    }

    const cdpPortPath = getCdpPortFile(sessionId);
    let cdpPort: number | undefined;
    if (existsSync(cdpPortPath)) {
      const parsed = parseInt(readFileSync(cdpPortPath, "utf-8").trim(), 10);
      if (!isNaN(parsed)) {
        cdpPort = parsed;
      }
    }

    if (!isDaemonRunning(sessionId)) {
      console.debug(`[DaemonRecovery] Cannot recover ${sessionId}: daemon not running`);
      cleanupSocket(sessionId);
      return null;
    }

    callbacks.onRecover(sessionId, streamPort, cdpPort);
    console.log(`[DaemonRecovery] Recovered: ${sessionId} on stream port ${streamPort}, CDP port ${cdpPort ?? "unknown"}`);
    return { sessionId, port: streamPort, cdpPort: cdpPort ?? 0, ready: isDaemonRunning(sessionId) };
  } catch (error) {
    console.warn(`[DaemonRecovery] Failed to recover ${sessionId}:`, error);
    return null;
  }
}

export function discoverExistingSessions(callbacks: RecoveryCallbacks): void {
  const socketDir = getSocketDir();
  if (!existsSync(socketDir)) return;

  const files = readdirSync(socketDir);
  const streamFiles = files.filter((file) => file.endsWith(".stream"));

  for (const streamFile of streamFiles) {
    const sessionId = streamFile.replace(".stream", "");
    if (sessionId === "default") continue;
    recoverSession(sessionId, callbacks);
  }
}
