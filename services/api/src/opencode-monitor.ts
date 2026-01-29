import { db } from "@lab/database/client";
import { sessions } from "@lab/database/schema/sessions";
import { isNotNull } from "drizzle-orm";
import { opencode } from "./opencode";
import { publisher } from "./publisher";

interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

interface SessionTracker {
  labSessionId: string;
  opencodeSessionId: string;
  abortController: AbortController;
}

const trackers = new Map<string, SessionTracker>();

function getChangeType(before: string, after: string): "modified" | "created" | "deleted" {
  if (!before && after) return "created";
  if (before && !after) return "deleted";
  return "modified";
}

function toReviewableFile(diff: FileDiff) {
  return {
    path: diff.file,
    originalContent: diff.before,
    currentContent: diff.after,
    status: "pending" as const,
    changeType: getChangeType(diff.before, diff.after),
  };
}

async function monitorSession(tracker: SessionTracker): Promise<void> {
  const { labSessionId, abortController } = tracker;
  const directory = `/workspaces/${labSessionId}`;

  try {
    const { stream } = await opencode.event.subscribe(
      { directory },
      { signal: abortController.signal },
    );
    if (!stream) return;

    for await (const event of stream) {
      if (abortController.signal.aborted) break;
      if (event.type !== "session.diff") continue;

      const diffs = event.properties?.diff as FileDiff[] | undefined;
      if (!diffs?.length) continue;

      for (const diff of diffs) {
        publisher.publishDelta(
          "sessionChangedFiles",
          { uuid: labSessionId },
          {
            type: "add",
            file: toReviewableFile(diff),
          },
        );
      }
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.error(`[OpenCode Monitor] Error for ${labSessionId}:`, error);
      setTimeout(() => monitorSession(tracker), 5000);
    }
  }
}

function startTracking(labSessionId: string, opencodeSessionId: string): void {
  if (trackers.has(labSessionId)) return;

  const tracker: SessionTracker = {
    labSessionId,
    opencodeSessionId,
    abortController: new AbortController(),
  };

  trackers.set(labSessionId, tracker);
  monitorSession(tracker);
}

function stopTracking(labSessionId: string): void {
  const tracker = trackers.get(labSessionId);
  if (!tracker) return;

  tracker.abortController.abort();
  trackers.delete(labSessionId);
}

async function syncSessions(): Promise<void> {
  const active = await db
    .select({ id: sessions.id, opencodeSessionId: sessions.opencodeSessionId })
    .from(sessions)
    .where(isNotNull(sessions.opencodeSessionId));

  const activeIds = new Set(active.map((s) => s.id));

  for (const [id] of trackers) {
    if (!activeIds.has(id)) stopTracking(id);
  }

  for (const { id, opencodeSessionId } of active) {
    if (opencodeSessionId) startTracking(id, opencodeSessionId);
  }
}

export async function startOpenCodeMonitor(): Promise<void> {
  console.log("[OpenCode Monitor] Starting...");

  try {
    await syncSessions();
  } catch (error) {
    console.error("[OpenCode Monitor] Initial sync failed:", error);
  }

  setInterval(() => syncSessions().catch(console.error), 30000);
}
