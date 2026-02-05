import { formatContainerName, formatUniqueHostname } from "../shared/naming";
import { findContainersWithDependencies } from "../repositories/container-dependency.repository";
import {
  updateSessionContainerRuntimeId,
  updateSessionContainersStatusBySessionId,
} from "../repositories/container-session.repository";
import { CircularDependencyError } from "@lab/sandbox-sdk";
import { findSessionById } from "../repositories/session.repository";
import { SESSION_STATUS } from "../types/session";
import { CONTAINER_STATUS } from "../types/container";
import type { BrowserService } from "../browser/browser-service";
import { createSessionNetwork, type NetworkContainerNames } from "./network";
import { buildEnvironmentVariables } from "./environment-builder";
import { buildNetworkAliasesAndPortMap } from "./port-mapper";
import {
  buildContainerNodes,
  prepareContainerData,
  resolveStartOrder,
  type PreparedContainer,
} from "./container-preparer";
import type { SessionCleanupService } from "../services/session-cleanup.service";
import type { Sandbox, Publisher } from "../types/dependencies";
import type { ProxyManager } from "../services/proxy.service";
import { InternalError } from "../shared/errors";

interface ClusterContainer {
  containerId: string;
  hostname: string;
  ports: Record<number, number>;
}

export interface InitializeSessionContainersDeps {
  containerNames: NetworkContainerNames;
  sandbox: Sandbox;
  publisher: Publisher;
  proxyManager: ProxyManager;
  cleanupService: SessionCleanupService;
}

async function createAndStartContainer(
  sessionId: string,
  projectId: string,
  networkName: string,
  prepared: PreparedContainer,
  deps: Pick<InitializeSessionContainersDeps, "sandbox">,
): Promise<{ runtimeId: string; clusterContainer: ClusterContainer | null }> {
  const { containerDefinition, ports, envVars, containerWorkspace } = prepared;
  const { sandbox } = deps;

  const env = buildEnvironmentVariables(sessionId, envVars);
  const serviceHostname = containerDefinition.hostname || containerDefinition.id;
  const uniqueHostname = formatUniqueHostname(sessionId, containerDefinition.id);
  const containerName = formatContainerName(sessionId, containerDefinition.id);
  const { portMap, networkAliases } = buildNetworkAliasesAndPortMap(
    sessionId,
    containerDefinition.id,
    ports,
  );

  console.log(`[Container] Creating ${containerDefinition.image} for session ${sessionId}`);
  const { runtimeId } = await sandbox.runtime.startContainer({
    sessionId,
    projectId,
    containerId: containerDefinition.id,
    serviceName: serviceHostname,
    containerName,
    image: containerDefinition.image,
    networkName,
    hostname: uniqueHostname,
    workdir: containerWorkspace,
    env: Object.keys(env).length > 0 ? env : undefined,
    ports: ports.map(({ port }) => port),
    networkAliases,
  });
  console.log(`[Container] Created and started ${runtimeId}`);

  await updateSessionContainerRuntimeId(sessionId, containerDefinition.id, runtimeId);

  const clusterContainer =
    Object.keys(portMap).length > 0
      ? { containerId: containerDefinition.id, hostname: uniqueHostname, ports: portMap }
      : null;

  return { runtimeId, clusterContainer };
}

async function startContainersInLevel(
  sessionId: string,
  projectId: string,
  networkName: string,
  containerIds: string[],
  preparedByContainerId: Map<string, PreparedContainer>,
  deps: Pick<InitializeSessionContainersDeps, "sandbox">,
): Promise<{ runtimeIds: string[]; clusterContainers: ClusterContainer[] }> {
  const levelRuntimeIds: string[] = [];
  const levelClusterContainers: ClusterContainer[] = [];

  const results = await Promise.all(
    containerIds.map((containerId) => {
      const prepared = preparedByContainerId.get(containerId);
      if (!prepared) {
        throw new InternalError(
          `Prepared container not found for ${containerId}`,
          "PREPARED_CONTAINER_NOT_FOUND",
        );
      }
      return createAndStartContainer(sessionId, projectId, networkName, prepared, deps);
    }),
  );

  for (const result of results) {
    levelRuntimeIds.push(result.runtimeId);
    if (result.clusterContainer) {
      levelClusterContainers.push(result.clusterContainer);
    }
  }

  return { runtimeIds: levelRuntimeIds, clusterContainers: levelClusterContainers };
}

export async function initializeSessionContainers(
  sessionId: string,
  projectId: string,
  browserService: BrowserService,
  deps: InitializeSessionContainersDeps,
): Promise<void> {
  const { containerNames, sandbox, proxyManager, cleanupService } = deps;

  const containerDefinitions = await findContainersWithDependencies(projectId);
  const runtimeIds: string[] = [];
  const clusterContainers: ClusterContainer[] = [];

  try {
    const containerNodes = buildContainerNodes(containerDefinitions);
    const startLevels = resolveStartOrder(containerNodes);

    const networkName = await createSessionNetwork(sessionId, containerNames, sandbox);

    const preparedContainers = await Promise.all(
      containerDefinitions.map((definition) =>
        prepareContainerData(sessionId, definition, sandbox),
      ),
    );

    const preparedByContainerId = new Map<string, PreparedContainer>();
    for (const prepared of preparedContainers) {
      preparedByContainerId.set(prepared.containerDefinition.id, prepared);
    }

    for (const level of startLevels) {
      const levelResult = await startContainersInLevel(
        sessionId,
        projectId,
        networkName,
        level.containerIds,
        preparedByContainerId,
        deps,
      );
      runtimeIds.push(...levelResult.runtimeIds);
      clusterContainers.push(...levelResult.clusterContainers);
    }

    if (clusterContainers.length > 0) {
      await proxyManager.registerCluster(sessionId, networkName, clusterContainers);
    }

    const session = await findSessionById(sessionId);
    if (!session || session.status === SESSION_STATUS.DELETING) {
      console.log(`Session ${sessionId} was deleted during initialization, cleaning up`);
      await cleanupService.cleanupOrphanedResources(sessionId, runtimeIds, browserService);
      return;
    }
  } catch (error) {
    if (error instanceof CircularDependencyError) {
      console.error(`Circular dependency in project ${projectId}: ${error.cycle.join(" -> ")}`);
    }
    console.error(`Failed to initialize session ${sessionId}:`, error);
    await handleInitializationError(sessionId, projectId, runtimeIds, browserService, deps);
  }
}

async function handleInitializationError(
  sessionId: string,
  projectId: string,
  runtimeIds: string[],
  browserService: BrowserService,
  deps: Pick<InitializeSessionContainersDeps, "publisher" | "cleanupService">,
): Promise<void> {
  const errorContainers = await updateSessionContainersStatusBySessionId(
    sessionId,
    CONTAINER_STATUS.ERROR,
  );

  for (const container of errorContainers) {
    deps.publisher.publishDelta(
      "sessionContainers",
      { uuid: sessionId },
      { type: "update", container: { id: container.id, status: CONTAINER_STATUS.ERROR } },
    );
  }

  await deps.cleanupService.cleanupOnError(sessionId, projectId, runtimeIds, browserService);
}
