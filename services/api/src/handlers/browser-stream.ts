import {
  getBrowserSnapshot,
  getCachedFrame,
  setCachedFrame,
  launchBrowser,
} from "../browser/handlers";
import type { ServerWebSocket } from "bun";

const BROWSER_WS_HOST = process.env.BROWSER_WS_HOST ?? "browser";

export interface BrowserStreamData {
  type: "browser-stream";
  sessionId: string;
  browserWs: WebSocket | null;
}

export async function handleBrowserStreamUpgrade(
  request: Request,
  server: { upgrade: (req: Request, options: { data: BrowserStreamData }) => boolean },
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("sessionId required", { status: 400 });
  }

  const data: BrowserStreamData = {
    type: "browser-stream",
    sessionId,
    browserWs: null,
  };

  const success = server.upgrade(request, { data });

  return success ? undefined : new Response("Upgrade failed", { status: 500 });
}

async function connectToBrowser(
  ws: ServerWebSocket<BrowserStreamData>,
  sessionId: string,
): Promise<void> {
  const snapshot = await getBrowserSnapshot(sessionId);

  if (!snapshot.streamPort) {
    return;
  }

  const cachedFrame = await getCachedFrame(sessionId);
  if (cachedFrame) {
    ws.send(cachedFrame);
  }

  await launchBrowser(sessionId);

  await new Promise((resolve) => setTimeout(resolve, 500));

  const browserWs = new WebSocket(`ws://${BROWSER_WS_HOST}:${snapshot.streamPort}`);

  browserWs.onmessage = (event) => {
    const data = event.data.toString();

    if (data.includes('"type":"frame"')) {
      setCachedFrame(sessionId, data).catch(console.error);
    }

    ws.send(event.data);
  };

  browserWs.onclose = () => ws.close();
  browserWs.onerror = () => ws.close();
  ws.data.browserWs = browserWs;
}

export const browserStreamHandler = {
  async open(ws: ServerWebSocket<BrowserStreamData>) {
    const { sessionId } = ws.data;
    connectToBrowser(ws, sessionId);
  },

  message(ws: ServerWebSocket<BrowserStreamData>, message: string | Buffer) {
    const { browserWs } = ws.data;
    browserWs?.send(message);
  },

  close(ws: ServerWebSocket<BrowserStreamData>) {
    const { browserWs } = ws.data;
    browserWs?.close();
  },
};
