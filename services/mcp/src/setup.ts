import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DockerClient } from "@lab/sandbox-docker";
import { MCP_SERVER } from "./config/constants";
import { makeRegisterTool } from "./tools/register";
import { bash } from "./tools/bash";
import { browser } from "./tools/browser";
import { container } from "./tools/container";
import { github } from "./tools/github";
import { initializeBucket } from "./utils/rustfs";
import type { env } from "./env";

type SetupOptions = {
  env: (typeof env)["inferOut"];
};

type SetupFunction = (options: SetupOptions) => unknown;

export const setup = (async ({ env }) => {
  await initializeBucket(env);

  const docker = new DockerClient();

  const server = new McpServer({
    name: MCP_SERVER.NAME,
    version: MCP_SERVER.VERSION,
  });

  const { registerTool } = makeRegisterTool(server, docker, env);

  registerTool(bash);
  registerTool(browser);
  registerTool(container);
  registerTool(github);

  const transport = new WebStandardStreamableHTTPServerTransport();

  return { server, transport };
}) satisfies SetupFunction;
