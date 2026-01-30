import { type Reconciler } from "./reconciler";

export interface ReconcilerLoop {
  start(): void;
  stop(): void;
}

export const createReconcilerLoop = (
  reconciler: Reconciler,
  intervalMs: number,
  onError: (error: unknown) => void,
): ReconcilerLoop => {
  const state: { interval: ReturnType<typeof setInterval> | null } = { interval: null };

  const run = () => {
    reconciler.reconcileAll().catch(onError);
  };

  return {
    start() {
      if (state.interval) return;
      run();
      state.interval = setInterval(run, intervalMs);
    },

    stop() {
      if (!state.interval) return;
      clearInterval(state.interval);
      state.interval = null;
    },
  };
};
