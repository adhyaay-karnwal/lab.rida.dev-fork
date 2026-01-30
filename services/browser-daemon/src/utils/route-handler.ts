export type { HttpMethod, RouteHandler, RouteContext, RouteModule } from "../types/route";
import type { HttpMethod, RouteModule } from "../types/route";

const HTTP_METHODS: Set<string> = new Set(["GET", "POST", "DELETE", "HEAD"]);

export function isHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.has(method);
}

export function isRouteModule(module: unknown): module is RouteModule {
  if (typeof module !== "object" || module === null) return false;
  for (const key of Object.keys(module)) {
    if (HTTP_METHODS.has(key)) return true;
  }
  return false;
}
