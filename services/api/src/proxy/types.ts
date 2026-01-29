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

export interface CaddyRoute {
  "@id": string;
  match: Array<{ host: string[] }>;
  handle: Array<{
    handler: "reverse_proxy";
    upstreams: Array<{ dial: string }>;
  }>;
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
