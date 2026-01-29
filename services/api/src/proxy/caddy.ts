import type { CaddyConfig, CaddyRoute } from "./types";

export class CaddyClient {
  private readonly adminUrl: string;

  constructor(adminUrl: string) {
    this.adminUrl = adminUrl;
  }

  async getConfig(): Promise<unknown> {
    const response = await fetch(`${this.adminUrl}/config/`);

    if (!response.ok) {
      throw new Error(`Failed to get Caddy config: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async loadConfig(config: CaddyConfig): Promise<void> {
    const response = await fetch(`${this.adminUrl}/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to load Caddy config: ${response.status} ${response.statusText} - ${body}`,
      );
    }
  }

  async addRoute(route: CaddyRoute): Promise<void> {
    const response = await fetch(`${this.adminUrl}/config/apps/http/servers/srv0/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(route),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to add route: ${response.status} ${response.statusText} - ${body}`);
    }
  }

  async deleteRoute(id: string): Promise<void> {
    const response = await fetch(`${this.adminUrl}/id/${id}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(
        `Failed to delete route ${id}: ${response.status} ${response.statusText} - ${body}`,
      );
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.adminUrl}/config/`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
