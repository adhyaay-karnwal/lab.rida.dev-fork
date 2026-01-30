import { db } from "@lab/database/client";
import { sessions } from "@lab/database/schema/sessions";
import { projects } from "@lab/database/schema/projects";
import { eq } from "drizzle-orm";
import type { PromptService } from "../prompts/types";
import { createPromptContext } from "../prompts/context";
import { proxyManager, isProxyInitialized } from "../proxy";
import type { RouteInfo } from "../proxy/types";

const opencodeUrl = process.env.OPENCODE_URL;

const PROMPT_ENDPOINTS = ["/session/", "/prompt", "/message"];

function shouldInjectSystemPrompt(path: string, method: string): boolean {
  return method === "POST" && PROMPT_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

interface SessionData {
  sessionId: string;
  projectId: string;
  projectSystemPrompt: string | null;
}

async function getSessionData(labSessionId: string): Promise<SessionData | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, labSessionId));

  if (!session) {
    return null;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, session.projectId));

  return {
    sessionId: labSessionId,
    projectId: session.projectId,
    projectSystemPrompt: project?.systemPrompt ?? null,
  };
}

function getServiceRoutes(sessionId: string): RouteInfo[] {
  if (!isProxyInitialized()) {
    return [];
  }

  try {
    return proxyManager.getUrls(sessionId);
  } catch {
    return [];
  }
}

async function buildProxyBody(
  request: Request,
  path: string,
  labSessionId: string | null,
  promptService: PromptService,
): Promise<BodyInit | null> {
  const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);

  if (!hasBody) {
    return null;
  }

  if (!labSessionId || !shouldInjectSystemPrompt(path, request.method)) {
    return request.body;
  }

  const sessionData = await getSessionData(labSessionId);

  if (!sessionData) {
    return request.body;
  }

  const routeInfos = getServiceRoutes(labSessionId);

  const promptContext = createPromptContext({
    sessionId: sessionData.sessionId,
    projectId: sessionData.projectId,
    routeInfos,
    projectSystemPrompt: sessionData.projectSystemPrompt,
  });

  const { text: composedPrompt } = promptService.compose(promptContext);

  if (!composedPrompt) {
    return request.body;
  }

  const originalBody = await request.json();
  const existingSystem = originalBody.system ?? "";
  const combinedSystem = composedPrompt + (existingSystem ? "\n\n" + existingSystem : "");

  return JSON.stringify({ ...originalBody, system: combinedSystem });
}

function buildForwardHeaders(request: Request): Headers {
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete("X-Lab-Session-Id");
  forwardHeaders.delete("host");
  return forwardHeaders;
}

function buildSseResponse(proxyResponse: Response): Response {
  const body = proxyResponse.body;

  if (!body) {
    return new Response(null, {
      status: proxyResponse.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lab-Session-Id",
      },
    });
  }

  return new Response(body, {
    status: proxyResponse.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lab-Session-Id",
    },
  });
}

function buildStandardResponse(proxyResponse: Response): Response {
  const responseHeaders = new Headers(proxyResponse.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  responseHeaders.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Lab-Session-Id",
  );

  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    headers: responseHeaders,
  });
}

function isSseResponse(path: string, proxyResponse: Response): boolean {
  return (
    path.includes("/event") ||
    proxyResponse.headers.get("content-type")?.includes("text/event-stream") === true
  );
}

function buildTargetUrl(path: string, url: URL, labSessionId: string | null): string {
  const targetParams = new URLSearchParams(url.search);

  if (labSessionId) {
    targetParams.set("directory", `/workspaces/${labSessionId}`);
  }

  const queryString = targetParams.toString();
  return `${opencodeUrl}${path}${queryString ? `?${queryString}` : ""}`;
}

export type OpenCodeProxyHandler = (request: Request, url: URL) => Promise<Response>;

export function createOpenCodeProxyHandler(promptService: PromptService): OpenCodeProxyHandler {
  return async function handleOpenCodeProxy(request: Request, url: URL): Promise<Response> {
    if (!opencodeUrl) {
      return new Response("OPENCODE_URL not configured", { status: 500 });
    }

    const path = url.pathname.replace(/^\/opencode/, "");
    const labSessionId = request.headers.get("X-Lab-Session-Id");
    const targetUrl = buildTargetUrl(path, url, labSessionId);

    const forwardHeaders = buildForwardHeaders(request);
    const body = await buildProxyBody(request, path, labSessionId, promptService);

    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      ...(body ? { duplex: "half" } : {}),
    });

    if (isSseResponse(path, proxyResponse)) {
      return buildSseResponse(proxyResponse);
    }

    return buildStandardResponse(proxyResponse);
  };
}
