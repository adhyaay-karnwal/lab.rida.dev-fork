export interface RouteInfo {
  containerPort: number;
  url: string;
}

interface ClusterContainer {
  containerId: string;
  hostname: string;
  ports: Record<number, number>;
}
