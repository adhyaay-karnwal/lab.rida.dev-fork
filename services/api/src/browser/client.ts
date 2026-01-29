export class BrowserClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async startSession(
    sessionId: string,
    options: { callbackUrl?: string } = {},
  ): Promise<{ port: number; ready: boolean }> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callbackUrl: options.callbackUrl }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to start browser session: ${response.status} - ${body}`);
    }

    const data = await response.json();
    return { port: data.port, ready: data.ready };
  }

  async stopSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(`Failed to stop browser session: ${response.status} - ${body}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getStreamPort(sessionId: string): Promise<number | null> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/stream-port`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.streamPort;
    } catch {
      return null;
    }
  }
}
