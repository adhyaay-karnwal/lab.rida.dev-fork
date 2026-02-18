import { createClient } from "@lab/client";
import { mutate } from "swr";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
  throw new Error("Must set NEXT_PUBLIC_API_URL");
}

export const api = createClient({ baseUrl: API_BASE });

export async function fetchChannelSnapshot<T>(
  channel: string,
  sessionId: string
): Promise<T> {
  const response = await fetch(
    `${API_BASE}/channels/${channel}/snapshot?session=${sessionId}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${channel} snapshot`);
  }
  const { data } = await response.json();
  return data as T;
}

const pendingContainerPrefetches = new Set<string>();

export function prefetchSessionContainers(sessionId: string): void {
  const cacheKey = `sessionContainers-${sessionId}`;
  if (pendingContainerPrefetches.has(sessionId)) {
    return;
  }

  pendingContainerPrefetches.add(sessionId);
  fetchChannelSnapshot("sessionContainers", sessionId)
    .then((data) => mutate(cacheKey, data, false))
    .finally(() => pendingContainerPrefetches.delete(sessionId));
}

interface GitHubSettingsInput {
  pat?: string;
  username?: string;
  authorName?: string;
  authorEmail?: string;
  attributeAgent?: boolean;
}

interface GitHubSettingsResponse {
  configured: boolean;
  id?: string;
  username?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  attributeAgent?: boolean;
  hasPatConfigured?: boolean;
  isOAuthConnected?: boolean;
  oauthConnectedAt?: string | null;
}

export interface ClaudeAuthStatusResponse {
  flow: {
    state:
      | "idle"
      | "pending"
      | "starting"
      | "url_ready"
      | "awaiting_code"
      | "connected"
      | "error";
    loginUrl: string | null;
    error: string | null;
    startedAt: string | null;
    updatedAt: string | null;
    processAlive?: boolean;
  };
  auth: {
    loggedIn?: boolean;
    authMethod?: string;
    email?: string;
    subscriptionType?: string;
    [key: string]: unknown;
  } | null;
}

export async function getGitHubSettings(): Promise<GitHubSettingsResponse> {
  const response = await fetch(`${API_BASE}/github/settings`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch GitHub settings");
  }
  return response.json();
}

export async function saveGitHubSettings(
  settings: GitHubSettingsInput
): Promise<GitHubSettingsResponse> {
  const response = await fetch(`${API_BASE}/github/settings`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error("Failed to save GitHub settings");
  }
  return response.json();
}

export async function disconnectGitHub(): Promise<void> {
  const response = await fetch(`${API_BASE}/github/disconnect`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to disconnect GitHub");
  }
}

export function getGitHubAuthUrl(): string {
  return `${API_BASE}/github/auth`;
}

export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatusResponse> {
  const response = await fetch(`${API_BASE}/acp/claude/auth/status`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Claude auth status");
  }
  return response.json();
}

export async function startClaudeAuth(): Promise<ClaudeAuthStatusResponse> {
  const response = await fetch(`${API_BASE}/acp/claude/auth/start`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to start Claude auth");
  }
  return response.json();
}

export async function logoutClaudeAuth(): Promise<ClaudeAuthStatusResponse> {
  const response = await fetch(`${API_BASE}/acp/claude/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to logout Claude auth");
  }
  return response.json();
}

export async function submitClaudeAuthCode(
  code: string
): Promise<ClaudeAuthStatusResponse> {
  const response = await fetch(`${API_BASE}/acp/claude/auth/code`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error("Failed to submit Claude auth code");
  }
  return response.json();
}

export function getClaudeAuthEventsUrl(): string {
  return `${API_BASE}/acp/claude/auth/events`;
}
