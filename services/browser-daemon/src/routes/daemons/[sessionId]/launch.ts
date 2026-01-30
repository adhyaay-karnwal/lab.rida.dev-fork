import type { RouteHandler } from "../../../utils/route-handler";
import { notFoundResponse, badRequestResponse } from "../../../shared/http";

export const POST: RouteHandler = (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId;
  if (!sessionId) {
    return badRequestResponse("Session ID required");
  }

  const session = daemonManager.getOrRecoverSession(sessionId);
  if (!session) {
    return notFoundResponse("Session not found");
  }

  const url = daemonManager.getCurrentUrl(sessionId);
  return Response.json({
    sessionId,
    launched: true,
    url,
    port: session.port,
    cdpPort: session.cdpPort,
    ready: session.ready,
  });
};
