import type { DockerContainerEvent } from "@lab/sandbox-docker";
import { docker } from "../../clients/docker";
import { LABELS, TIMING } from "../../config/constants";
import type { ContainerStatus } from "../../types/container";
import {
  findSessionContainerByDockerId,
  updateSessionContainerStatus,
} from "../repositories/container.repository";
import { publisher } from "../../clients/publisher";

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

class ContainerMonitor {
  private readonly abortController = new AbortController();

  async start(): Promise<void> {
    console.log("[Container Monitor] Starting...");
    this.monitor();
  }

  stop(): void {
    console.log("[Container Monitor] Stopping...");
    this.abortController.abort();
  }

  private async monitor(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      try {
        for await (const event of docker.streamContainerEvents({
          filters: { label: [LABELS.SESSION] },
        })) {
          if (this.abortController.signal.aborted) break;

          const status = mapEventToStatus(event);
          if (!status) continue;

          const sessionId = event.attributes[LABELS.SESSION];
          if (!sessionId) continue;

          const sessionContainer = await findSessionContainerByDockerId(event.containerId);
          if (!sessionContainer) continue;

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
      } catch (error) {
        if (this.abortController.signal.aborted) return;
        console.error("[Container Monitor] Error:", error);
        await new Promise((resolve) => setTimeout(resolve, TIMING.CONTAINER_MONITOR_RETRY_MS));
      }
    }
  }
}

export function createContainerMonitor() {
  const monitor = new ContainerMonitor();
  return {
    start: () => monitor.start(),
    stop: () => monitor.stop(),
  };
}
