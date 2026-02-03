import { docker } from "../../clients/docker";
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

interface ContainerCleanupResult {
  dockerId: string;
  success: boolean;
  stillExists: boolean;
  error?: unknown;
}

async function stopAndRemoveContainerWithVerification(
  dockerId: string,
): Promise<ContainerCleanupResult> {
  try {
    await docker.stopContainer(dockerId);
    await docker.removeContainer(dockerId);

    const stillExists = await docker.containerExists(dockerId);

    if (stillExists) {
      console.error(`[Session Cleanup] Container ${dockerId} still exists after removal attempt`);
    }

    return { dockerId, success: !stillExists, stillExists };
  } catch (error) {
    return { dockerId, success: false, stillExists: true, error };
  }
}

function logContainerCleanupFailures(results: ContainerCleanupResult[], sessionId: string): void {
  const failures = results.filter((result) => !result.success);

  for (const failure of failures) {
    if (failure.error) {
      console.error(
        `[Session Cleanup] Failed to cleanup container dockerId=${failure.dockerId} sessionId=${sessionId}:`,
        failure.error,
      );
    } else if (failure.stillExists) {
      console.error(
        `[Session Cleanup] Container dockerId=${failure.dockerId} still exists after cleanup sessionId=${sessionId}`,
      );
    }
  }
}

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
      title: session.title,
    },
  });

  const containers = await findSessionContainersBySessionId(sessionId);
  const containersWithDockerIds = containers.filter((container) => container.dockerId);

  const cleanupResults = await Promise.allSettled(
    containersWithDockerIds.map((container) =>
      stopAndRemoveContainerWithVerification(container.dockerId),
    ),
  );

  const fulfilledResults = cleanupResults
    .filter(
      (result): result is PromiseFulfilledResult<ContainerCleanupResult> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);

  logContainerCleanupFailures(fulfilledResults, sessionId);

  await browserService.forceStopBrowser(sessionId);

  if (isProxyInitialized()) {
    try {
      await proxyManager.unregisterCluster(sessionId);
    } catch (error) {
      console.warn(
        `[Session Cleanup] Failed to unregister proxy cluster sessionId=${sessionId}:`,
        error,
      );
    }
  }

  try {
    await cleanupSessionNetwork(sessionId);
  } catch (error) {
    console.error(`[Session Cleanup] Failed to cleanup network sessionId=${sessionId}:`, error);
  }

  await deleteSession(sessionId);
}
