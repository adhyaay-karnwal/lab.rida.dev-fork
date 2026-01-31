import { docker } from "../../clients/docker";
import { formatSessionTitle } from "../../types/session";
import { findSessionContainersBySessionId } from "../repositories/container.repository";
import {
  deleteSession,
  findSessionById,
  markSessionDeleting,
} from "../repositories/session.repository";
import { proxyManager, isProxyInitialized } from "../proxy";
import { publisher } from "../../clients/publisher";
import type { BrowserService } from "../browser/browser-service";
import { cleanupSessionNetwork } from "../docker/network";

export async function cleanupSession(
  sessionId: string,
  browserService: BrowserService,
): Promise<void> {
  const session = await findSessionById(sessionId);
  if (!session) return;

  await markSessionDeleting(sessionId);

  publisher.publishDelta("sessions", {
    type: "remove",
    session: {
      id: session.id,
      projectId: session.projectId,
      title: formatSessionTitle(session.id),
    },
  });

  const containers = await findSessionContainersBySessionId(sessionId);

  await Promise.all(
    containers
      .filter((container) => container.dockerId)
      .map(async (container) => {
        await docker.stopContainer(container.dockerId);
        await docker.removeContainer(container.dockerId);
      }),
  );

  await browserService.forceStopBrowser(sessionId);

  if (isProxyInitialized()) {
    try {
      await proxyManager.unregisterCluster(sessionId);
    } catch (error) {
      console.warn(`Failed to unregister proxy cluster for session ${sessionId}:`, error);
    }
  }

  await cleanupSessionNetwork(sessionId);
  await deleteSession(sessionId);
}
