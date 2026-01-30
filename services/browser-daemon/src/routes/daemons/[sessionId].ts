import type { RouteHandler } from "../../utils/route-handler";
import { notFoundResponse } from "../../shared/http";

export const GET: RouteHandler = (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const session = daemonManager.getSession(sessionId);

  return Response.json({
    type: "status",
    sessionId,
    running: daemonManager.isRunning(sessionId),
    ready: daemonManager.isReady(sessionId),
    port: session?.port ?? null,
    cdpPort: session?.cdpPort ?? null,
  });
};

export const POST: RouteHandler = async (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const result = await daemonManager.start(sessionId);
  return Response.json(result);
};

export const DELETE: RouteHandler = (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const result = daemonManager.stop(sessionId);

  if (result.type === "not_found") {
    return notFoundResponse(`Session ${sessionId} not found`);
  }

  return Response.json(result);
};
