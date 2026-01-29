import { publisher } from "../publisher";

interface BrowserReadyPayload {
  sessionId: string;
  port: number;
  ready: boolean;
}

export async function handleBrowserReadyCallback(request: Request): Promise<Response> {
  try {
    const payload: BrowserReadyPayload = await request.json();
    const { sessionId, port, ready } = payload;

    if (!sessionId || !port) {
      return new Response("Invalid payload", { status: 400 });
    }

    if (ready) {
      // Notify all subscribers that the browser is ready
      publisher.publishSnapshot(
        "sessionBrowserStream",
        { uuid: sessionId },
        {
          ready: true,
          streamPort: port,
        },
      );
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error handling browser ready callback:", err);
    return new Response("Internal error", { status: 500 });
  }
}
