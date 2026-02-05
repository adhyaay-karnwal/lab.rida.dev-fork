export interface RuntimeContainerStartInput {
  sessionId: string;
  projectId: string;
  containerId: string;
  serviceName: string;
  containerName: string;
  image: string;
  networkName: string;
  hostname: string;
  workdir: string;
  env?: Record<string, string>;
  ports?: number[];
  networkAliases?: string[];
}

export interface RuntimeContainerStartResult {
  runtimeId: string;
}

export interface RuntimeManager {
  startContainer(input: RuntimeContainerStartInput): Promise<RuntimeContainerStartResult>;
}
