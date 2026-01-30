import { db } from "@lab/database/client";
import { containers, type Container } from "@lab/database/schema/containers";
import { containerPorts, type ContainerPort } from "@lab/database/schema/container-ports";
import { containerEnvVars, type ContainerEnvVar } from "@lab/database/schema/container-env-vars";
import { sessionContainers, type SessionContainer } from "@lab/database/schema/session-containers";
import { eq, and, asc } from "drizzle-orm";
import type { ContainerStatus } from "../../types/container";

export async function findContainersByProjectId(projectId: string): Promise<Container[]> {
  return db.select().from(containers).where(eq(containers.projectId, projectId));
}

export async function createContainer(data: {
  projectId: string;
  image: string;
  hostname?: string;
}): Promise<Container> {
  const [container] = await db.insert(containers).values(data).returning();
  return container;
}

export async function createContainerPorts(containerId: string, ports: number[]): Promise<void> {
  if (ports.length === 0) return;
  await db.insert(containerPorts).values(ports.map((port) => ({ containerId, port })));
}

export async function createSessionContainer(data: {
  sessionId: string;
  containerId: string;
  dockerId: string;
  status: string;
}): Promise<SessionContainer> {
  const [sessionContainer] = await db.insert(sessionContainers).values(data).returning();
  return sessionContainer;
}

export async function findPortsByContainerId(containerId: string): Promise<ContainerPort[]> {
  return db.select().from(containerPorts).where(eq(containerPorts.containerId, containerId));
}

export async function findEnvVarsByContainerId(containerId: string): Promise<ContainerEnvVar[]> {
  return db.select().from(containerEnvVars).where(eq(containerEnvVars.containerId, containerId));
}

export async function findSessionContainersBySessionId(
  sessionId: string,
): Promise<SessionContainer[]> {
  return db.select().from(sessionContainers).where(eq(sessionContainers.sessionId, sessionId));
}

export async function findSessionContainerByDockerId(
  dockerId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: sessionContainers.id })
    .from(sessionContainers)
    .where(eq(sessionContainers.dockerId, dockerId));
  return row ?? null;
}

export async function updateSessionContainerDockerId(
  sessionId: string,
  containerId: string,
  dockerId: string,
): Promise<void> {
  await db
    .update(sessionContainers)
    .set({ dockerId })
    .where(
      and(
        eq(sessionContainers.sessionId, sessionId),
        eq(sessionContainers.containerId, containerId),
      ),
    );
}

export async function updateSessionContainerStatus(
  id: string,
  status: ContainerStatus,
): Promise<void> {
  await db.update(sessionContainers).set({ status }).where(eq(sessionContainers.id, id));
}

export async function updateSessionContainersStatusBySessionId(
  sessionId: string,
  status: ContainerStatus,
): Promise<{ id: string }[]> {
  await db
    .update(sessionContainers)
    .set({ status })
    .where(eq(sessionContainers.sessionId, sessionId));

  return db
    .select({ id: sessionContainers.id })
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));
}

export async function getFirstExposedPort(sessionId: string): Promise<number | null> {
  const result = await db
    .select({ port: containerPorts.port })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port))
    .limit(1);

  return result[0]?.port ?? null;
}

export async function getFirstExposedService(
  sessionId: string,
): Promise<{ hostname: string; port: number } | null> {
  const result = await db
    .select({
      port: containerPorts.port,
    })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port))
    .limit(1);

  if (!result[0]) return null;

  const hostname = `${sessionId}--${result[0].port}`;
  return { hostname, port: result[0].port };
}

export async function getSessionContainersWithDetails(sessionId: string): Promise<
  {
    id: string;
    containerId: string;
    status: string;
    hostname: string | null;
    image: string;
  }[]
> {
  return db
    .select({
      id: sessionContainers.id,
      containerId: sessionContainers.containerId,
      status: sessionContainers.status,
      hostname: containers.hostname,
      image: containers.image,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.sessionId, sessionId));
}

export async function getSessionContainersWithPorts(sessionId: string): Promise<
  {
    hostname: string;
    port: number;
  }[]
> {
  const result = await db
    .select({
      port: containerPorts.port,
    })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port));

  return result.map((row) => ({
    hostname: `${sessionId}--${row.port}`,
    port: row.port,
  }));
}
