import { z } from "zod";
import type { RouteHandler } from "../../../utils/route-handler";
import { notFoundResponse, badRequestResponse, serviceUnavailableResponse } from "../../../shared/http";

const NavigateBody = z.object({
  url: z.string().url(),
});

export const POST: RouteHandler = async (request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const session = daemonManager.getSession(sessionId);
  if (!session) {
    return notFoundResponse("Session not found");
  }

  if (!daemonManager.isReady(sessionId)) {
    return serviceUnavailableResponse("Session not ready");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Invalid JSON body");
  }

  const parsed = NavigateBody.safeParse(body);
  if (!parsed.success) {
    return badRequestResponse("URL required");
  }

  const { url } = parsed.data;

  console.log(`[Navigate] ${sessionId} -> ${url}`);
  daemonManager.navigate(sessionId, url);
  console.log(`[Navigate] ${sessionId} complete`);
  return Response.json({ sessionId, navigated: true });
};
