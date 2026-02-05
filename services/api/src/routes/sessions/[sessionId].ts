import { z } from "zod";
import { noContentResponse } from "@lab/http-utilities";
import { findSessionByIdOrThrow, updateSessionFields } from "../../repositories/session.repository";
import { findSessionContainersBySessionId } from "../../repositories/container-session.repository";
import { formatProxyUrl } from "../../shared/naming";
import { parseRequestBody } from "../../shared/validation";
import { withParams } from "../../shared/route-helpers";
import type { RouteContextFor } from "../../types/route";

const patchSessionSchema = z.object({
  opencodeSessionId: z.string().optional(),
  workspaceDirectory: z.string().optional(),
  title: z.string().optional(),
});

function buildContainerUrls(
  sessionId: string,
  ports: Record<string, number>,
  proxyBaseDomain: string,
): string[] {
  return Object.keys(ports).map((containerPort) =>
    formatProxyUrl(sessionId, parseInt(containerPort, 10), proxyBaseDomain),
  );
}

type SessionReadContext = RouteContextFor<"infra" | "proxy">;
type SessionCleanupContext = RouteContextFor<"session">;

const GET = withParams<{ sessionId: string }, SessionReadContext>(
  ["sessionId"],
  async ({ sessionId }, _request, ctx) => {
    const session = await findSessionByIdOrThrow(sessionId);

    const containers = await findSessionContainersBySessionId(sessionId);

    const containersWithStatus = await Promise.all(
      containers.map(async (container) => {
        if (!container.runtimeId) return { ...container, info: null, urls: [] };
        const info = await ctx.sandbox.provider.inspectContainer(container.runtimeId);
        const urls = info?.ports
          ? buildContainerUrls(sessionId, info.ports, ctx.proxyBaseDomain)
          : [];
        return { ...container, info, urls };
      }),
    );

    return Response.json({ ...session, containers: containersWithStatus });
  },
);

const PATCH = withParams<{ sessionId: string }>(["sessionId"], async ({ sessionId }, request) => {
  await findSessionByIdOrThrow(sessionId);

  const body = await parseRequestBody(request, patchSessionSchema);

  const updated = await updateSessionFields(sessionId, {
    opencodeSessionId: body.opencodeSessionId,
    workspaceDirectory: body.workspaceDirectory,
    title: body.title,
  });

  return Response.json(updated);
});

const DELETE = withParams<{ sessionId: string }, SessionCleanupContext>(
  ["sessionId"],
  async ({ sessionId }, _request, ctx) => {
    await findSessionByIdOrThrow(sessionId);

    await ctx.sessionLifecycle.cleanupSession(sessionId);
    return noContentResponse();
  },
);

export { DELETE, GET, PATCH };
