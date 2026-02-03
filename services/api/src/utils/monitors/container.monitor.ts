import type { DockerContainerEvent } from "@lab/sandbox-docker";
import { docker } from "../../clients/docker";
import { LABELS } from "../../config/constants";
import type { ContainerStatus } from "../../types/container";
import {
  findSessionContainerByDockerId,
  updateSessionContainerStatus,
} from "../repositories/container.repository";
import { publisher } from "../../clients/publisher";

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;

function mapEventToStatus(event: DockerContainerEvent): ContainerStatus | null {
  switch (event.action) {
    case "start":
      return "running";
    case "stop":
    case "die":
    case "kill":
      return "stopped";
    case "restart":
      return "starting";
    case "oom":
      return "error";
    case "health_status":
      if (event.attributes["health_status"] === "unhealthy") {
        return "error";
      }
      return null;
    default:
      return null;
  }
}

function calculateNextRetryDelay(currentDelay: number): number {
  return Math.min(currentDelay * 2, MAX_RETRY_DELAY_MS);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class ContainerMonitor {
  private readonly abortController = new AbortController();

  async start(): Promise<void> {
    console.log("[Container Monitor] Starting...");
    this.runMonitorLoop();
  }

  stop(): void {
    console.log("[Container Monitor] Stopping...");
    this.abortController.abort();
  }

  private async runMonitorLoop(): Promise<void> {
    let retryDelay = INITIAL_RETRY_DELAY_MS;

    while (!this.abortController.signal.aborted) {
      try {
        for await (const event of docker.streamContainerEvents({
          filters: { label: [LABELS.SESSION] },
        })) {
          if (this.abortController.signal.aborted) break;

          retryDelay = INITIAL_RETRY_DELAY_MS;
          await this.processContainerEvent(event);
        }
      } catch (error) {
        if (this.abortController.signal.aborted) return;

        console.error(`[Container Monitor] Error, retrying in ${retryDelay}ms:`, error);
        await sleep(retryDelay);
        retryDelay = calculateNextRetryDelay(retryDelay);
      }
    }
  }

  private async processContainerEvent(event: DockerContainerEvent): Promise<void> {
    const status = mapEventToStatus(event);
    if (!status) return;

    const sessionId = event.attributes[LABELS.SESSION];
    if (!sessionId) return;

    const sessionContainer = await findSessionContainerByDockerId(event.containerId);
    if (!sessionContainer) return;

    await updateSessionContainerStatus(sessionContainer.id, status);

    publisher.publishDelta(
      "sessionContainers",
      { uuid: sessionId },
      {
        type: "update",
        container: { id: sessionContainer.id, status },
      },
    );
  }
}

export function createContainerMonitor() {
  const monitor = new ContainerMonitor();
  return {
    start: () => monitor.start(),
    stop: () => monitor.stop(),
  };
}
