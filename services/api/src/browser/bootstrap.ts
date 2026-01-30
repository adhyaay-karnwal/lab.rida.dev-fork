import {
  type BrowserSessionState,
  type DaemonController,
  type StateStore,
} from "@lab/browser-protocol";
import { db } from "@lab/database/client";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { containerPorts } from "@lab/database/schema/container-ports";
import { eq, asc, and } from "drizzle-orm";
import { createBrowserService, type BrowserService } from "./browser-service";
import {
  getState,
  setState,
  setDesiredState,
  setCurrentState,
  transitionState,
  getAllSessions,
  deleteSession,
  updateHeartbeat,
  setLastUrl,
} from "./state-store";
import {
  start,
  stop,
  navigate,
  getStatus,
  getCurrentUrl,
  launch,
  isHealthy,
} from "./daemon-controller";

export interface BrowserBootstrapConfig {
  browserApiUrl: string;
  browserWsHost: string;
  cleanupDelayMs: number;
  reconcileIntervalMs: number;
  maxRetries: number;
  publishFrame: (sessionId: string, frame: string, timestamp: number) => void;
  publishStateChange: (sessionId: string, state: BrowserSessionState) => void;
}

const stateStore: StateStore = {
  getState,
  setState,
  setDesiredState,
  setCurrentState,
  transitionState,
  getAllSessions,
  deleteSession,
  updateHeartbeat,
  setLastUrl,
};

const getFirstExposedPort = async (sessionId: string): Promise<number | null> => {
  const result = await db
    .select({ port: containerPorts.port })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(and(eq(sessionContainers.sessionId, sessionId), eq(sessionContainers.status, "running")))
    .orderBy(asc(containerPorts.port))
    .limit(1);

  return result[0]?.port ?? null;
};

export const bootstrapBrowserService = async (
  config: BrowserBootstrapConfig,
): Promise<BrowserService> => {
  const baseUrl = config.browserApiUrl;

  const daemonController: DaemonController = {
    start: (sessionId, url) => start(baseUrl, sessionId, url),
    stop: (sessionId) => stop(baseUrl, sessionId),
    navigate: (sessionId, url) => navigate(baseUrl, sessionId, url),
    getStatus: (sessionId) => getStatus(baseUrl, sessionId),
    getCurrentUrl: (sessionId) => getCurrentUrl(baseUrl, sessionId),
    launch: (sessionId) => launch(baseUrl, sessionId),
    isHealthy: () => isHealthy(baseUrl),
  };

  const service = await createBrowserService(
    {
      browserWsHost: config.browserWsHost,
      cleanupDelayMs: config.cleanupDelayMs,
      reconcileIntervalMs: config.reconcileIntervalMs,
      maxRetries: config.maxRetries,
    },
    {
      stateStore,
      daemonController,
      publishFrame: config.publishFrame,
      publishStateChange: config.publishStateChange,
      getFirstExposedPort,
    },
  );

  return service;
};

export const shutdownBrowserService = (service: BrowserService): void => {
  service.stopReconciler();
};
