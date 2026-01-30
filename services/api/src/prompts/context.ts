import type { RouteInfo } from "../proxy/types";
import type { PromptContext, ServiceRoute } from "./types";

export interface CreatePromptContextParams {
  sessionId: string;
  projectId: string;
  routeInfos: RouteInfo[];
  projectSystemPrompt: string | null;
}

export function createPromptContext(params: CreatePromptContextParams): PromptContext {
  const serviceRoutes: ServiceRoute[] = params.routeInfos.map((route) => ({
    port: route.containerPort,
    url: route.url,
  }));

  return {
    sessionId: params.sessionId,
    projectId: params.projectId,
    serviceRoutes,
    projectSystemPrompt: params.projectSystemPrompt,
  };
}
