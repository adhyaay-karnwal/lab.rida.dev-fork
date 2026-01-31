import { docker } from "../../clients/docker";
import { notFoundResponse, noContentResponse } from "../../shared/http";
import {
  findSessionById,
  updateSessionOpencodeId,
  updateSessionTitle,
} from "../../utils/repositories/session.repository";
import { findSessionContainersBySessionId } from "../../utils/repositories/container.repository";
import { cleanupSession } from "../../utils/session/session-cleanup";
import { config } from "../../config/environment";
import type { RouteHandler } from "../../utils/handlers/route-handler";

function buildContainerUrls(sessionId: string, ports: Record<string, number>): string[] {
  return Object.keys(ports).map(
    (containerPort) => `http://${sessionId}--${containerPort}.${config.proxyBaseDomain}`,
  );
}

const GET: RouteHandler = async (_request, params) => {
  const session = await findSessionById(params.sessionId);
  if (!session) return notFoundResponse();

  const containers = await findSessionContainersBySessionId(params.sessionId);

  const containersWithStatus = await Promise.all(
    containers.map(async (container) => {
      if (!container.dockerId) return { ...container, info: null, urls: [] };
      const info = await docker.inspectContainer(container.dockerId);
      const urls = info?.ports ? buildContainerUrls(params.sessionId, info.ports) : [];
      return { ...container, info, urls };
    }),
  );

  return Response.json({ ...session, containers: containersWithStatus });
};

const PATCH: RouteHandler = async (request, params) => {
  let session = await findSessionById(params.sessionId);
  if (!session) return notFoundResponse();

  const body = await request.json();

  if (typeof body.opcodeSessionId === "string") {
    session = await updateSessionOpencodeId(params.sessionId, body.opcodeSessionId);
  }

  if (typeof body.title === "string") {
    session = await updateSessionTitle(params.sessionId, body.title);
  }

  return Response.json(session);
};

const DELETE: RouteHandler = async (_request, params, context) => {
  const session = await findSessionById(params.sessionId);
  if (!session) return notFoundResponse();

  await cleanupSession(params.sessionId, context.browserService);
  return noContentResponse();
};

export { DELETE, GET, PATCH };
