import { serve } from "bun";
import { TIMING } from "./config/constants";
import type { env } from "./env";
import { widelog } from "./logging";
import { corsHeaders, proxyRequest } from "./proxy/request";
import { parseSubdomain, resolveUpstream } from "./proxy/upstream";
import type { setup } from "./setup";
import type { WebSocketData } from "./types/proxy";

interface MainOptions {
  env: (typeof env)["inferOut"];
  extras: ReturnType<typeof setup>;
}

type MainFunction = (options: MainOptions) => unknown;

function loggedClientError(
  statusCode: number,
  outcome: string,
  message: string
): Response {
  widelog.set("status_code", statusCode);
  widelog.set("outcome", outcome);
  return new Response(message, { status: statusCode });
}

async function resolveUpstreamForRequest(host: string) {
  const parsed = parseSubdomain(host);
  if (!parsed) {
    return {
      error: loggedClientError(
        400,
        "client_error",
        "Bad Request: Invalid subdomain format"
      ),
    };
  }

  const { sessionId, port } = parsed;
  widelog.set("session_id", sessionId);
  widelog.set("upstream_port", port);

  const upstream = await resolveUpstream(sessionId, port);
  if (!upstream) {
    return {
      error: loggedClientError(
        404,
        "not_found",
        "Not Found: Session or port not available"
      ),
    };
  }

  return { upstream };
}

function tryWebSocketUpgrade<
  T extends {
    upgrade: (req: Request, opts: { data: WebSocketData }) => boolean;
  },
>(
  request: Request,
  server: T,
  upstream: { hostname: string; port: number }
): Response | undefined {
  const url = new URL(request.url);
  const wsScheme = url.protocol === "https:" ? "wss:" : "ws:";
  const success = server.upgrade(request, {
    data: {
      upstream,
      upstreamWs: null,
      path: url.pathname + url.search,
      wsScheme,
      pendingMessages: [],
    },
  });
  if (success) {
    widelog.set("outcome", "ws_upgrade");
    return undefined;
  }
  widelog.set("status_code", 500);
  widelog.set("outcome", "ws_upgrade_failed");
  return new Response("WebSocket upgrade failed", { status: 500 });
}

function buildCorsProxyResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }

  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  widelog.set("status_code", finalResponse.status);
  widelog.set("outcome", "success");
  return finalResponse;
}

export const main = (({ extras }) => {
  const { port } = extras;

  const server = serve<WebSocketData>({
    port,
    idleTimeout: TIMING.IDLE_TIMEOUT_SECONDS,
    fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return new Response("OK", { status: 200 });
      }

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      return widelog.context(async () => {
        widelog.set("method", request.method);
        widelog.set("path", url.pathname);
        widelog.time.start("duration_ms");

        try {
          const host = request.headers.get("host");
          if (!host) {
            return loggedClientError(
              400,
              "client_error",
              "Bad Request: Missing Host header"
            );
          }

          const result = await resolveUpstreamForRequest(host);
          if (result.error) {
            return result.error;
          }
          const { upstream } = result;

          const upgradeHeader = request.headers.get("upgrade");
          if (upgradeHeader?.toLowerCase() === "websocket") {
            return tryWebSocketUpgrade(
              request,
              server,
              upstream
            ) as unknown as Response;
          }

          const response = await proxyRequest(request, upstream, 0);
          return buildCorsProxyResponse(response);
        } catch (error) {
          widelog.set("outcome", "error");
          widelog.errorFields(error);
          return new Response("Internal Server Error", { status: 500 });
        } finally {
          widelog.time.stop("duration_ms");
          widelog.flush();
        }
      });
    },
    websocket: {
      open(ws) {
        const { upstream, path, wsScheme } = ws.data;
        const upstreamUrl = `${wsScheme}//${upstream.hostname}:${upstream.port}${path}`;

        const upstreamWs = new WebSocket(upstreamUrl);
        ws.data.upstreamWs = upstreamWs;

        upstreamWs.onopen = () => {
          for (const msg of ws.data.pendingMessages) {
            upstreamWs.send(msg);
          }
          ws.data.pendingMessages = [];
        };

        upstreamWs.onmessage = (event) => {
          ws.send(event.data);
        };

        upstreamWs.onclose = () => {
          ws.close();
        };

        upstreamWs.onerror = (error) => {
          widelog.context(() => {
            widelog.set("event_name", "proxy.upstream_ws_error");
            widelog.set("upstream_host", upstream.hostname);
            widelog.set("upstream_port", upstream.port);
            widelog.set("path", path);
            widelog.set("outcome", "error");
            widelog.errorFields(error);
            ws.close();
            widelog.flush();
          });
        };
      },
      message(ws, message) {
        const { upstreamWs } = ws.data;
        if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(message);
        } else {
          ws.data.pendingMessages.push(message);
        }
      },
      close(ws) {
        const { upstreamWs } = ws.data;
        if (upstreamWs) {
          upstreamWs.close();
        }
      },
    },
  });

  widelog.context(() => {
    widelog.set("event_name", "proxy.startup");
    if (server.port) {
      widelog.set("port", server.port);
    }
    widelog.flush();
  });

  return () => {
    widelog.context(() => {
      widelog.set("event_name", "proxy.shutdown");
      widelog.flush();
    });
    server.stop(true);
  };
}) satisfies MainFunction;
