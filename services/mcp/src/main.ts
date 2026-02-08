import { logger } from "./logging";
import type { setup } from "./setup";
import type { env } from "./env";

type MainOptions = {
  env: (typeof env)["inferOut"];
  extras: Awaited<ReturnType<typeof setup>>;
};

type MainFunction = (options: MainOptions) => unknown;

export const main = (async ({ env, extras }) => {
  const { server, transport } = extras;

  await server.connect(transport);

  const httpServer = Bun.serve({
    port: env.MCP_PORT,
    fetch: (request) => transport.handleRequest(request),
  });

  logger.info({
    event_name: "mcp.startup",
    port: env.MCP_PORT,
  });

  return () => {
    logger.info({ event_name: "mcp.shutdown" });
    httpServer.stop(true);
  };
}) satisfies MainFunction;
