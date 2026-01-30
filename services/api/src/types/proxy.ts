export interface RouteInfo {
  containerPort: number;
  url: string;
}

export interface ClusterContainer {
  containerId: string;
  hostname: string;
  ports: Record<number, number>;
}

export interface ProxyManager {
  initialize(): Promise<void>;
  registerCluster(
    clusterId: string,
    networkName: string,
    containers: ClusterContainer[],
  ): Promise<RouteInfo[]>;
  unregisterCluster(clusterId: string): Promise<void>;
  getUrls(clusterId: string): RouteInfo[];
}

export interface ReverseProxyHandler {
  handler: "reverse_proxy";
  upstreams: Array<{ dial: string }>;
  transport?: {
    protocol: "http";
    dial_timeout?: string;
    response_header_timeout?: string;
    read_timeout?: string;
    write_timeout?: string;
  };
  health_checks?: {
    passive?: {
      fail_duration?: string;
      max_fails?: number;
      unhealthy_status?: number[];
      unhealthy_latency?: string;
    };
  };
  handle_response?: Array<{
    match?: { status_code?: number[] };
    routes?: Array<{
      handle: Array<{ handler: "static_response"; status_code: number; body?: string }>;
    }>;
  }>;
}

export interface CaddyRoute {
  "@id": string;
  match: Array<{ host?: string[]; path?: string[] }>;
  handle: Array<ReverseProxyHandler | { handler: "rewrite"; strip_path_prefix: string }>;
}

export interface CaddyServerConfig {
  listen: string[];
  routes: CaddyRoute[];
}

export interface CaddyHttpConfig {
  servers: Record<string, CaddyServerConfig>;
}

export interface CaddyConfig {
  admin?: { listen: string };
  apps?: {
    http?: CaddyHttpConfig;
  };
}
