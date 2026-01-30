import { publisher } from "../publisher";
import {
  type Orchestrator,
  type BrowserSessionState,
  createOrchestrator,
  createPortAllocator,
} from "@lab/browser-orchestration";
import { createDbStateStore } from "./db-state-store";
import { createHttpDaemonController } from "./daemon-controller";

const BROWSER_API_URL = process.env.BROWSER_API_URL;
if (!BROWSER_API_URL) {
  throw new Error("BROWSER_API_URL must be defined");
}

const CLEANUP_DELAY_MS = parseInt(process.env.BROWSER_CLEANUP_DELAY_MS ?? "10000", 10);
const RECONCILE_INTERVAL_MS = parseInt(process.env.RECONCILE_INTERVAL_MS ?? "5000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_DAEMON_RETRIES ?? "3", 10);

const stateStore = createDbStateStore();
const daemonController = createHttpDaemonController({ baseUrl: BROWSER_API_URL });

const initializePortAllocator = async () => {
  const sessions = await stateStore.getAllSessions();
  const allocatedPorts = sessions.map((s) => s.streamPort).filter((p): p is number => p !== null);
  return createPortAllocator(undefined, allocatedPorts);
};

let orchestratorPromise: Promise<Orchestrator> | null = null;

const createBrowserOrchestrator = async (): Promise<Orchestrator> => {
  const portAllocator = await initializePortAllocator();

  const orchestrator = createOrchestrator(stateStore, daemonController, portAllocator, {
    maxRetries: MAX_RETRIES,
    reconcileIntervalMs: RECONCILE_INTERVAL_MS,
    cleanupDelayMs: CLEANUP_DELAY_MS,
  });

  orchestrator.onStateChange((sessionId: string, state: BrowserSessionState) => {
    publisher.publishSnapshot(
      "sessionBrowserState",
      { uuid: sessionId },
      {
        desiredState: state.desiredState,
        actualState: state.actualState,
        streamPort: state.streamPort ?? undefined,
        errorMessage: state.errorMessage ?? undefined,
      },
    );
  });

  orchestrator.onError((error: unknown) => {
    console.error("[BrowserOrchestrator] Reconciliation error:", error);
  });

  return orchestrator;
};

const getOrchestrator = (): Promise<Orchestrator> => {
  if (!orchestratorPromise) {
    orchestratorPromise = createBrowserOrchestrator();
  }
  return orchestratorPromise;
};

export const getBrowserSnapshot = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  const snapshot = await orchestrator.getSnapshot(sessionId);
  return {
    desiredState: snapshot.desiredState,
    actualState: snapshot.actualState,
    streamPort: snapshot.streamPort,
    errorMessage: snapshot.errorMessage,
  };
};

export const subscribeBrowser = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  return orchestrator.subscribe(sessionId);
};

export const unsubscribeBrowser = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  return orchestrator.unsubscribe(sessionId);
};

export const forceStopBrowser = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  await orchestrator.forceStop(sessionId);
};

export const launchBrowser = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  await orchestrator.launchBrowser(sessionId);
};

export const getCachedFrame = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  return orchestrator.getCachedFrame(sessionId);
};

export const setCachedFrame = async (sessionId: string, frame: string) => {
  const orchestrator = await getOrchestrator();
  orchestrator.setCachedFrame(sessionId, frame);
};

export const startReconciler = async () => {
  const orchestrator = await getOrchestrator();
  orchestrator.startReconciler();
};

export const stopReconciler = async () => {
  const orchestrator = await getOrchestrator();
  orchestrator.stopReconciler();
};
