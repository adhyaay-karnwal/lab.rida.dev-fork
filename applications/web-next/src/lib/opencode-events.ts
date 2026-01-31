"use client";

import { createOpencodeClient, type Event } from "@opencode-ai/sdk/client";

type EventListener = (event: Event) => void;

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

function formatDirectory(sessionId: string): string {
  return `/workspaces/${sessionId}`;
}

export function subscribeToSessionEvents(
  sessionId: string,
  listener: EventListener,
  signal: AbortSignal,
): void {
  const client = createOpencodeClient({
    baseUrl: `${getApiUrl()}/opencode`,
    headers: { "X-Lab-Session-Id": sessionId },
  });

  const directory = formatDirectory(sessionId);

  const connect = async (): Promise<void> => {
    while (!signal.aborted) {
      try {
        const { stream } = await client.event.subscribe({ directory }, { signal });

        for await (const event of stream) {
          if (signal.aborted) return;
          listener(event);
        }

        if (!signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch {
        if (signal.aborted) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  connect();
}

export type { Event };
