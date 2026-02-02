import type { Session } from "@lab/database/schema/sessions";
import { claimPooledSession } from "../pool/pool-manager";
import { createSession, updateSessionTitle } from "../repositories/session.repository";
import {
  findContainersByProjectId,
  createSessionContainer,
  getSessionContainersWithDetails,
} from "../repositories/container.repository";
import { publisher } from "../../clients/publisher";
import type { BrowserService } from "../browser/browser-service";
import { initializeSessionContainers } from "../docker/containers";
import { reconcilePool } from "../pool/pool-manager";

export interface SpawnSessionOptions {
  projectId: string;
  taskSummary: string;
  browserService: BrowserService;
}

export interface SpawnSessionResult {
  session: Session;
  containers: Array<{
    id: string;
    name: string;
    status: "starting" | "running" | "stopped" | "error";
    urls: Array<{ port: number; url: string }>;
  }>;
}

type ContainerRow = SpawnSessionResult["containers"][number];
type ContainerStatus = ContainerRow["status"];

function validateContainerStatus(status: string): ContainerStatus {
  if (status === "starting" || status === "running" || status === "stopped" || status === "error") {
    return status;
  }
  throw new Error(`Invalid container status: ${status}`);
}

function normalizeTaskSummary(taskSummary?: string): string | undefined {
  return taskSummary?.trim().replace(/\s+/g, " ");
}

function extractContainerDisplayName(container: {
  hostname: string | null;
  image: string;
}): string {
  if (container.hostname) {
    return container.hostname;
  }
  const imageName = container.image.split("/").pop()?.split(":")[0];
  if (!imageName) {
    throw new Error(`Unable to extract display name from container image: ${container.image}`);
  }
  return imageName;
}

function publishSessionCreated(session: Session, containers: ContainerRow[]): void {
  publisher.publishDelta("sessions", {
    type: "add",
    session: { id: session.id, projectId: session.projectId, title: session.title },
  });
  publisher.publishSnapshot("sessionContainers", { uuid: session.id }, containers);
}

function scheduleBackgroundWork(
  sessionId: string,
  projectId: string,
  browserService: BrowserService,
): void {
  initializeSessionContainers(sessionId, projectId, browserService).catch((error) => {
    console.error(`[Orchestration] Background initialization failed for ${sessionId}:`, error);
  });
  reconcilePool(projectId).catch((error) => {
    console.error(`[Orchestration] Pool reconciliation failed for project ${projectId}:`, error);
  });
}

async function claimAndPreparePooledSession(
  projectId: string,
  title?: string,
): Promise<SpawnSessionResult | null> {
  const pooledSession = await claimPooledSession(projectId);
  if (!pooledSession) {
    return null;
  }

  const session = await updateSessionTitle(pooledSession.id, title);
  if (!session) {
    throw new Error("Failed to update pooled session title");
  }

  const existingContainers = await getSessionContainersWithDetails(pooledSession.id);
  const containers: ContainerRow[] = existingContainers.map((container) => ({
    id: container.id,
    name: extractContainerDisplayName(container),
    status: validateContainerStatus(container.status),
    urls: [],
  }));

  publishSessionCreated(session, containers);
  return { session, containers };
}

async function createSessionWithContainers(
  projectId: string,
  title?: string,
): Promise<SpawnSessionResult> {
  const containerDefinitions = await findContainersByProjectId(projectId);
  if (containerDefinitions.length === 0) {
    throw new Error("Project has no container definitions");
  }

  const session = await createSession(projectId, title);
  const containers: ContainerRow[] = [];

  for (const definition of containerDefinitions) {
    const sessionContainer = await createSessionContainer({
      sessionId: session.id,
      containerId: definition.id,
      dockerId: "",
      status: "starting",
    });

    containers.push({
      id: sessionContainer.id,
      name: extractContainerDisplayName(definition),
      status: "starting",
      urls: [],
    });
  }

  publishSessionCreated(session, containers);
  return { session, containers };
}

export async function spawnSession(options: SpawnSessionOptions): Promise<SpawnSessionResult> {
  const { projectId, taskSummary, browserService } = options;
  const title = normalizeTaskSummary(taskSummary);

  const pooledResult = await claimAndPreparePooledSession(projectId, title);
  if (pooledResult) {
    return pooledResult;
  }

  const result = await createSessionWithContainers(projectId, title);
  scheduleBackgroundWork(result.session.id, projectId, browserService);
  return result;
}
