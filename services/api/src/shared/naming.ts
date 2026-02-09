export function formatUniqueHostname(
  sessionId: string,
  containerId: string
): string {
  return `s-${sessionId.slice(0, 8)}-${containerId.slice(0, 8)}`;
}

export function formatProxyUrl(
  sessionId: string,
  port: number,
  baseUrl: string
): string {
  const url = new URL(baseUrl);
  url.hostname = `${sessionId}--${port}.${url.hostname}`;
  return url.origin;
}

export function formatNetworkAlias(sessionId: string, port: number): string {
  return `${sessionId}--${port}`;
}

export function formatWorkspacePath(sessionId: string): string {
  return `/workspaces/${sessionId}`;
}

export function formatContainerWorkspacePath(
  sessionId: string,
  containerId: string
): string {
  return `/workspaces/${sessionId}/${containerId}`;
}
