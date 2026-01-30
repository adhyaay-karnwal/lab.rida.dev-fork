import { type BrowserSessionState, type ActualState } from "../types/schema";
import { computeRequiredAction, type Action } from "../types/state";
import { type StateStore, type StateStoreOptions } from "./state-store";
import { type DaemonController } from "./daemon-controller";
import { type PortAllocator } from "./port-allocator";

export interface ReconcilerConfig {
  maxRetries: number;
}

export interface Reconciler {
  reconcileSession(session: BrowserSessionState): Promise<void>;
  reconcileAll(): Promise<void>;
}

export const createReconciler = (
  stateStore: StateStore,
  daemonController: DaemonController,
  portAllocator: PortAllocator,
  config: ReconcilerConfig,
): Reconciler => {
  const updateActualState = (
    sessionId: string,
    actualState: ActualState,
    options: StateStoreOptions = {},
  ): Promise<BrowserSessionState> => {
    return stateStore.setActualState(sessionId, actualState, options);
  };

  const startSession = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId, retryCount, streamPort: existingPort } = session;

    if (retryCount >= config.maxRetries) {
      return;
    }

    await updateActualState(sessionId, "starting", {
      retryCount: retryCount + 1,
      errorMessage: null,
    });

    const port = existingPort ?? portAllocator.allocate();
    await updateActualState(sessionId, "starting", { streamPort: port });
    await daemonController.start(sessionId, port, session.lastUrl ?? undefined);
  };

  const stopSession = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId, streamPort } = session;

    const currentUrl = await daemonController.getCurrentUrl(sessionId);
    if (currentUrl && currentUrl !== "about:blank") {
      await stateStore.setLastUrl(sessionId, currentUrl);
    }

    await updateActualState(sessionId, "stopping");
    await daemonController.stop(sessionId);

    if (streamPort !== null) {
      portAllocator.release(streamPort);
    }

    await updateActualState(sessionId, "stopped", {
      streamPort: null,
      errorMessage: null,
      retryCount: 0,
    });
  };

  const checkDaemonReady = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const status = await daemonController.getStatus(sessionId);
    if (!status?.ready) return;

    await updateActualState(sessionId, "running", { streamPort: status.port });

    if (session.lastUrl && session.lastUrl !== "about:blank") {
      await daemonController.navigate(sessionId, session.lastUrl);
    }
  };

  const checkDaemonAlive = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const status = await daemonController.getStatus(sessionId);
    if (!status?.running) {
      await updateActualState(sessionId, "stopped");
    }
  };

  const checkStoppingComplete = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const status = await daemonController.getStatus(sessionId);
    if (!status?.running) {
      await updateActualState(sessionId, "stopped");
    }
  };

  const resetToStopped = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId, streamPort } = session;

    if (streamPort !== null) {
      portAllocator.release(streamPort);
    }

    await updateActualState(sessionId, "stopped", {
      streamPort: null,
      errorMessage: null,
    });
  };

  const executeAction = async (session: BrowserSessionState, action: Action): Promise<void> => {
    switch (action) {
      case "StartDaemon":
        return startSession(session);
      case "StopDaemon":
        return stopSession(session);
      case "WaitForReady":
        if (session.actualState === "starting") return checkDaemonReady(session);
        if (session.actualState === "stopping") return checkStoppingComplete(session);
        if (session.actualState === "running") return checkDaemonAlive(session);
        return;
      case "ResetToStopped":
        return resetToStopped(session);
      case "NoOp":
        return;
    }
  };

  const reconcileSession = async (session: BrowserSessionState): Promise<void> => {
    const action = computeRequiredAction(session.desiredState, session.actualState);
    await executeAction(session, action);
  };

  const reconcileAll = async (): Promise<void> => {
    const sessions = await stateStore.getAllSessions();
    const errors: Array<{ sessionId: string; error: unknown }> = [];

    for (const session of sessions) {
      try {
        await reconcileSession(session);
      } catch (error) {
        errors.push({ sessionId: session.sessionId, error });
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors.map((e) => e.error),
        `Reconciliation failed for ${errors.length} session(s): ${errors.map((e) => e.sessionId).join(", ")}`,
      );
    }
  };

  return { reconcileSession, reconcileAll };
};
