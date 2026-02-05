import type {
  RuntimeManager,
  RuntimeContainerStartInput,
  RuntimeContainerStartResult,
  SandboxProvider,
  VolumeBinding,
  RestartPolicy,
} from "@lab/sandbox-sdk";

export interface DockerRuntimeManagerConfig {
  workspacesSource: string;
  workspacesTarget: string;
  opencodeAuthSource: string;
  opencodeAuthTarget: string;
  browserSocketSource: string;
  browserSocketTarget: string;
  restartPolicy?: RestartPolicy;
}

const DEFAULT_RESTART_POLICY: RestartPolicy = {
  name: "on-failure",
  maximumRetryCount: 3,
};

export class DockerRuntimeManager implements RuntimeManager {
  constructor(
    private readonly provider: SandboxProvider,
    private readonly config: DockerRuntimeManagerConfig,
  ) {}

  async startContainer(input: RuntimeContainerStartInput): Promise<RuntimeContainerStartResult> {
    const runtimeId = await this.provider.createContainer({
      name: input.containerName,
      image: input.image,
      hostname: input.hostname,
      networkMode: input.networkName,
      workdir: input.workdir,
      env: input.env,
      ports: (input.ports ?? []).map((port) => ({ container: port, host: undefined })),
      volumes: this.getVolumeBindings(),
      labels: {
        "com.docker.compose.project": `lab-${input.sessionId}`,
        "com.docker.compose.service": input.serviceName,
        "lab.session": input.sessionId,
        "lab.project": input.projectId,
        "lab.container": input.containerId,
      },
      restartPolicy: this.config.restartPolicy ?? DEFAULT_RESTART_POLICY,
    });

    try {
      await this.provider.startContainer(runtimeId);
    } catch (startError) {
      await this.provider.removeContainer(runtimeId).catch(() => undefined);
      throw startError;
    }

    try {
      const aliases = input.networkAliases ?? [];
      if (aliases.length > 0) {
        const isConnected = await this.provider.isConnectedToNetwork(runtimeId, input.networkName);
        if (isConnected) {
          await this.provider.disconnectFromNetwork(runtimeId, input.networkName);
        }
        await this.provider.connectToNetwork(runtimeId, input.networkName, { aliases });

        const verifyConnected = await this.provider.isConnectedToNetwork(
          runtimeId,
          input.networkName,
        );
        if (!verifyConnected) {
          throw new Error(
            `Failed to connect container ${runtimeId} to network ${input.networkName}`,
          );
        }
      }
    } catch (networkError) {
      await this.provider.removeContainer(runtimeId, true).catch(() => undefined);
      throw networkError;
    }

    return { runtimeId };
  }

  private getVolumeBindings(): VolumeBinding[] {
    return [
      { source: this.config.workspacesSource, target: this.config.workspacesTarget },
      { source: this.config.opencodeAuthSource, target: this.config.opencodeAuthTarget },
      { source: this.config.browserSocketSource, target: this.config.browserSocketTarget },
    ];
  }
}
