import { findSessionContainersBySessionId } from "../repositories/container-session.repository";
import {
  deleteSession,
  findSessionById,
  updateSessionStatus,
} from "../repositories/session.repository";
import { SESSION_STATUS } from "../types/session";
import { clearAllSessionState } from "../state/state.service";
import type { BrowserService } from "../browser/browser-service";
import type { Sandbox, Publisher } from "../types/dependencies";
import type { ProxyManager } from "./proxy.service";

interface ContainerCleanupResult {
  runtimeId: string;
  success: boolean;
  stillExists: boolean;
  error?: unknown;
}

export interface CleanupSessionDeps {
  sandbox: Sandbox;
  publisher: Publisher;
  proxyManager: ProxyManager;
  cleanupSessionNetwork: (sessionId: string) => Promise<void>;
}

export class SessionCleanupService {
  constructor(private readonly deps: CleanupSessionDeps) {}

  async cleanupSessionFull(sessionId: string, browserService: BrowserService): Promise<void> {
    const { sandbox, publisher, proxyManager, cleanupSessionNetwork } = this.deps;

    const session = await findSessionById(sessionId);
    if (!session) return;

    await updateSessionStatus(sessionId, SESSION_STATUS.DELETING);

    publisher.publishDelta("sessions", {
      type: "remove",
      session: {
        id: session.id,
        projectId: session.projectId,
        title: session.title,
      },
    });

    const containers = await findSessionContainersBySessionId(sessionId);
    const runtimeIds = containers.filter((c) => c.runtimeId).map((c) => c.runtimeId);

    await this.stopAndRemoveContainers(runtimeIds, sandbox.provider, sessionId);
    await browserService.forceStopBrowser(sessionId);

    try {
      await proxyManager.unregisterCluster(sessionId);
    } catch (error) {
      console.warn(
        `[SessionCleanup] Failed to unregister proxy cluster sessionId=${sessionId}:`,
        error,
      );
    }

    try {
      await cleanupSessionNetwork(sessionId);
    } catch (error) {
      console.error(`[SessionCleanup] Failed to cleanup network sessionId=${sessionId}:`, error);
    }

    await deleteSession(sessionId);
    clearAllSessionState(sessionId);
  }

  async cleanupOrphanedResources(
    sessionId: string,
    runtimeIds: string[],
    browserService: BrowserService,
  ): Promise<void> {
    const { sandbox, proxyManager, cleanupSessionNetwork } = this.deps;

    await this.stopAndRemoveContainers(runtimeIds, sandbox.provider, sessionId);
    await browserService.forceStopBrowser(sessionId);

    try {
      await proxyManager.unregisterCluster(sessionId);
    } catch (error) {
      console.warn(
        `[SessionCleanup] Failed to unregister proxy cluster sessionId=${sessionId}:`,
        error,
      );
    }

    try {
      await cleanupSessionNetwork(sessionId);
    } catch (error) {
      console.error(`[SessionCleanup] Failed to cleanup network sessionId=${sessionId}:`, error);
    }
  }

  async cleanupOnError(
    sessionId: string,
    projectId: string,
    runtimeIds: string[],
    browserService: BrowserService,
  ): Promise<void> {
    const { sandbox, publisher, cleanupSessionNetwork } = this.deps;

    await updateSessionStatus(sessionId, "error");

    publisher.publishDelta("sessions", {
      type: "remove",
      session: { id: sessionId, projectId, title: null },
    });

    await this.stopAndRemoveContainers(runtimeIds, sandbox.provider, sessionId);
    await browserService.forceStopBrowser(sessionId);

    try {
      await cleanupSessionNetwork(sessionId);
    } catch (error) {
      console.error(`[SessionCleanup] Failed to cleanup network sessionId=${sessionId}:`, error);
    }

    await deleteSession(sessionId);
  }

  private async stopAndRemoveContainers(
    runtimeIds: string[],
    provider: Sandbox["provider"],
    sessionId: string,
  ): Promise<void> {
    const cleanupResults = await Promise.allSettled(
      runtimeIds.map(async (runtimeId) => {
        try {
          await provider.stopContainer(runtimeId);
          await provider.removeContainer(runtimeId);
          const stillExists = await provider.containerExists(runtimeId);
          return { runtimeId, success: !stillExists, stillExists };
        } catch (error) {
          return { runtimeId, success: false, stillExists: true, error };
        }
      }),
    );

    const fulfilledResults = cleanupResults
      .filter(
        (result): result is PromiseFulfilledResult<ContainerCleanupResult> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);

    this.logContainerCleanupFailures(fulfilledResults, sessionId);
  }

  private logContainerCleanupFailures(results: ContainerCleanupResult[], sessionId: string): void {
    const failures = results.filter((result) => !result.success);

    for (const failure of failures) {
      if (failure.error) {
        console.error(
          `[SessionCleanup] Failed to cleanup container runtimeId=${failure.runtimeId} sessionId=${sessionId}:`,
          failure.error,
        );
      } else if (failure.stillExists) {
        console.error(
          `[SessionCleanup] Container runtimeId=${failure.runtimeId} still exists after cleanup sessionId=${sessionId}`,
        );
      }
    }
  }
}
