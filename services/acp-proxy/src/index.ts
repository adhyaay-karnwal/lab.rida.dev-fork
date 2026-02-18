import { serve } from "bun";
import { agentProcesses } from "./agent-process";
import { handleAcpDelete, handleAcpGet, handleAcpPost } from "./routes/acp";
import { handleGetAgent, handleListAgents } from "./routes/agents";
import {
  handleClaudeAuthEvents,
  handleGetClaudeAuthStatus,
  handleLogoutClaudeAuth,
  handleStartClaudeAuth,
  handleSubmitClaudeAuthCode,
} from "./routes/claude-auth";
import { handleFsEntries, handleFsFile } from "./routes/fs";
import { handleHealth } from "./routes/health";

const ACP_PATTERN = /^\/v1\/acp\/([^/]+)$/;
const AGENT_ID_PATTERN = /^\/v1\/agents\/([^/]+)$/;

function routeClaudeAuth(
  request: Request,
  method: string
): Promise<Response> | Response | null {
  const path = new URL(request.url).pathname;

  if (path === "/v1/claude/auth/start" && method === "POST") {
    return handleStartClaudeAuth();
  }
  if (path === "/v1/claude/auth/status" && method === "GET") {
    return handleGetClaudeAuthStatus();
  }
  if (path === "/v1/claude/auth/events" && method === "GET") {
    return handleClaudeAuthEvents(request);
  }
  if (path === "/v1/claude/auth/logout" && method === "POST") {
    return handleLogoutClaudeAuth();
  }
  if (path === "/v1/claude/auth/code" && method === "POST") {
    return handleSubmitClaudeAuthCode(request);
  }

  return null;
}

function routeAcp(
  request: Request,
  serverId: string,
  method: string
): Promise<Response> | Response | null {
  if (method === "POST") {
    return handleAcpPost(request, serverId);
  }
  if (method === "GET") {
    return handleAcpGet(request, serverId);
  }
  if (method === "DELETE") {
    return handleAcpDelete(serverId);
  }
  return null;
}

function route(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/health" && method === "GET") {
    return handleHealth();
  }

  if (path === "/v1/agents" && method === "GET") {
    return handleListAgents();
  }

  if (path.startsWith("/v1/claude/auth/")) {
    const result = routeClaudeAuth(request, method);
    if (result) {
      return result;
    }
  }

  const agentMatch = path.match(AGENT_ID_PATTERN);
  if (agentMatch?.[1] && method === "GET") {
    return handleGetAgent(agentMatch[1], url);
  }

  const acpMatch = path.match(ACP_PATTERN);
  if (acpMatch?.[1]) {
    const result = routeAcp(request, acpMatch[1], method);
    if (result) {
      return result;
    }
  }

  if (path === "/v1/fs/entries" && method === "GET") {
    return handleFsEntries(url);
  }

  if (path === "/v1/fs/file" && method === "GET") {
    return handleFsFile(url);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

const PORT = Number(process.env.PORT ?? 3000);

const server = serve({
  port: PORT,
  fetch: route,
  idleTimeout: 255,
});

console.log(`acp-proxy listening on port ${server.port}`);

process.on("SIGTERM", async () => {
  const shutdowns = [...agentProcesses.values()].map((agent) =>
    agent.shutdown()
  );
  await Promise.allSettled(shutdowns);
  agentProcesses.clear();
  server.stop();
  process.exit(0);
});
