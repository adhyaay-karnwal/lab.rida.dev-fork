import { db } from "@lab/database/client";
import { containerPorts, type ContainerPort } from "@lab/database/schema/container-ports";
import { eq } from "drizzle-orm";

export async function findPortsByContainerId(containerId: string): Promise<ContainerPort[]> {
  return db.select().from(containerPorts).where(eq(containerPorts.containerId, containerId));
}
