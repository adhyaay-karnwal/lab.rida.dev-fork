import { DockerClient, type DockerContainerEvent } from "@lab/sandbox-docker";
import { db } from "@lab/database/client";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { eq } from "drizzle-orm";
import { publisher } from "./publisher";

type ContainerStatus = "running" | "stopped" | "starting" | "error";

const LAB_SESSION_LABEL = "lab.session";

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

export async function startContainerMonitor(): Promise<void> {
  const docker = new DockerClient();

  console.log("Starting container monitor...");

  try {
    for await (const event of docker.streamContainerEvents({
      filters: { label: [LAB_SESSION_LABEL] },
    })) {
      const status = mapEventToStatus(event);
      if (!status) continue;

      const sessionId = event.attributes[LAB_SESSION_LABEL];
      if (!sessionId) continue;

      const dockerId = event.containerId;

      const rows = await db
        .select({ id: sessionContainers.id })
        .from(sessionContainers)
        .where(eq(sessionContainers.dockerId, dockerId));

      if (rows.length === 0) continue;

      const sessionContainer = rows[0]!;

      await db
        .update(sessionContainers)
        .set({ status })
        .where(eq(sessionContainers.id, sessionContainer.id));

      publisher.publishDelta(
        "sessionContainers",
        { uuid: sessionId },
        {
          type: "update",
          id: sessionContainer.id,
          status,
        },
      );
    }
  } catch (error) {
    console.error("Container monitor error:", error);
    setTimeout(() => startContainerMonitor(), 5000);
  }
}
