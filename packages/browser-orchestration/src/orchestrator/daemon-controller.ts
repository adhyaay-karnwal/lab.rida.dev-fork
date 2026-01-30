import { type DaemonStatus } from "../types/schema";

export interface DaemonController {
  start(sessionId: string, port: number, url?: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  navigate(sessionId: string, url: string): Promise<void>;
  getStatus(sessionId: string): Promise<DaemonStatus | null>;
  getCurrentUrl(sessionId: string): Promise<string | null>;
  launch(sessionId: string): Promise<void>;
  isHealthy(): Promise<boolean>;
}
