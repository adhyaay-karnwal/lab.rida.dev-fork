import {
  type DaemonController,
  type DaemonStatus,
  DaemonStatus as DaemonStatusSchema,
  connectionFailed,
  daemonStartFailed,
  daemonStopFailed,
  navigationFailed,
} from "@lab/browser-orchestration";

export interface HttpDaemonControllerConfig {
  baseUrl: string;
}

export const createHttpDaemonController = (
  config: HttpDaemonControllerConfig,
): DaemonController => {
  const { baseUrl } = config;

  const start = async (sessionId: string, port: number): Promise<void> => {
    const response = await fetch(`${baseUrl}/daemons/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamPort: port }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw daemonStartFailed(sessionId, `HTTP ${response.status}: ${body}`);
    }
  };

  const stop = async (sessionId: string): Promise<void> => {
    const response = await fetch(`${baseUrl}/daemons/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw daemonStopFailed(sessionId, `HTTP ${response.status}: ${body}`);
    }
  };

  const navigate = async (sessionId: string, url: string): Promise<void> => {
    const response = await fetch(`${baseUrl}/daemons/${sessionId}/navigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw navigationFailed(sessionId, url, `HTTP ${response.status}: ${body}`);
    }
  };

  const getStatus = async (sessionId: string): Promise<DaemonStatus | null> => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/daemons/${sessionId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      throw connectionFailed(sessionId, message);
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      throw connectionFailed(sessionId, `HTTP ${response.status}: ${body}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw connectionFailed(sessionId, "Invalid JSON response");
    }

    const parsed = DaemonStatusSchema.safeParse(data);
    if (!parsed.success) {
      throw connectionFailed(sessionId, `Invalid response: ${parsed.error.message}`);
    }

    return parsed.data;
  };

  const getCurrentUrl = async (sessionId: string): Promise<string | null> => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/daemons/${sessionId}/url`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      throw connectionFailed(sessionId, message);
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      throw connectionFailed(sessionId, `HTTP ${response.status}: ${body}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw connectionFailed(sessionId, "Invalid JSON response");
    }

    if (typeof data === "object" && data !== null && "url" in data) {
      const url = (data as { url: unknown }).url;
      return typeof url === "string" ? url : null;
    }

    return null;
  };

  const launch = async (sessionId: string): Promise<void> => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/daemons/${sessionId}/launch`, {
        method: "POST",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      throw connectionFailed(sessionId, message);
    }

    if (!response.ok) {
      const body = await response.text();
      throw connectionFailed(sessionId, `HTTP ${response.status}: ${body}`);
    }
  };

  const isHealthy = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  };

  return {
    start,
    stop,
    navigate,
    getStatus,
    getCurrentUrl,
    launch,
    isHealthy,
  };
};
