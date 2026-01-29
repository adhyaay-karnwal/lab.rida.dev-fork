import { BrowserClient } from "./client";

const BROWSER_API_URL = process.env.BROWSER_API_URL;
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://api:3001";
const CLEANUP_DELAY_MS = 10000; // Wait 10 seconds before cleanup

export const browserClient = BROWSER_API_URL ? new BrowserClient(BROWSER_API_URL) : null;

// Track subscriber counts and pending cleanups per session
const subscriberCounts = new Map<string, number>();
const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();

export async function ensureBrowserSession(sessionId: string): Promise<void> {
  if (!browserClient) return;

  try {
    const callbackUrl = `${API_INTERNAL_URL}/internal/browser-ready`;
    await browserClient.startSession(sessionId, { callbackUrl });
  } catch (err) {
    console.warn(`Failed to start browser session ${sessionId}:`, err);
  }
}

export async function cleanupBrowserSession(sessionId: string): Promise<void> {
  if (!browserClient) return;

  try {
    await browserClient.stopSession(sessionId);
  } catch (err) {
    console.warn(`Failed to stop browser session ${sessionId}:`, err);
  }
}

export function subscribeToBrowserSession(sessionId: string): void {
  // Cancel any pending cleanup
  const pendingCleanup = pendingCleanups.get(sessionId);
  if (pendingCleanup) {
    clearTimeout(pendingCleanup);
    pendingCleanups.delete(sessionId);
  }

  const count = subscriberCounts.get(sessionId) ?? 0;
  subscriberCounts.set(sessionId, count + 1);

  // Start browser on first subscriber
  if (count === 0) {
    ensureBrowserSession(sessionId);
  }
}

export function unsubscribeFromBrowserSession(sessionId: string): void {
  const count = subscriberCounts.get(sessionId) ?? 0;
  if (count <= 0) return;

  const newCount = count - 1;
  subscriberCounts.set(sessionId, newCount);

  // Schedule cleanup when last subscriber leaves
  if (newCount === 0) {
    subscriberCounts.delete(sessionId);

    const timeout = setTimeout(() => {
      pendingCleanups.delete(sessionId);
      cleanupBrowserSession(sessionId);
    }, CLEANUP_DELAY_MS);

    pendingCleanups.set(sessionId, timeout);
  }
}
