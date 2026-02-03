import Dockerode from "dockerode";
import type {
  SandboxProvider,
  ContainerCreateOptions,
  ContainerInfo,
  ExitResult,
  LogChunk,
  NetworkCreateOptions,
  ExecOptions,
  ExecResult,
} from "@lab/sandbox-sdk";
import { SandboxError } from "@lab/sandbox-sdk";
import type {
  DockerClientOptions,
  DockerContainerEvent,
  DockerContainerEventAction,
} from "../types";
import { isNotFoundError, isNotRunningError } from "../utils";
import { toContainerState } from "../utils";
import {
  DEFAULT_SOCKET_PATH,
  DEFAULT_DOCKER_PORT,
  DEFAULT_DOCKER_PROTOCOL,
  ALPINE_IMAGE,
  VOLUME_CLONE_COMMAND,
} from "../constants";

export class DockerClient implements SandboxProvider {
  private docker: Dockerode;

  constructor(options: DockerClientOptions = {}) {
    if (options.host) {
      this.docker = new Dockerode({
        host: options.host,
        port: options.port ?? DEFAULT_DOCKER_PORT,
        protocol: options.protocol ?? DEFAULT_DOCKER_PROTOCOL,
      });
    } else {
      this.docker = new Dockerode({
        socketPath: options.socketPath ?? DEFAULT_SOCKET_PATH,
      });
    }
  }

  get raw(): Dockerode {
    return this.docker;
  }

  async pullImage(
    ref: string,
    onProgress?: (event: { status: string; progress?: string }) => void,
  ): Promise<void> {
    const stream = await this.docker.pull(ref);

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        },
        onProgress,
      );
    });
  }

  async imageExists(ref: string): Promise<boolean> {
    try {
      await this.docker.getImage(ref).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async getImageWorkdir(ref: string): Promise<string> {
    const info = await this.docker.getImage(ref).inspect();
    return info.Config.WorkingDir || "/";
  }

  async getImageConfig(ref: string): Promise<{
    workdir: string;
    entrypoint: string[] | null;
    cmd: string[] | null;
  }> {
    const info = await this.docker.getImage(ref).inspect();
    const entrypoint = info.Config.Entrypoint;
    return {
      workdir: info.Config.WorkingDir || "/",
      entrypoint: typeof entrypoint === "string" ? [entrypoint] : entrypoint || null,
      cmd: info.Config.Cmd || null,
    };
  }

  async createContainer(options: ContainerCreateOptions): Promise<string> {
    const { exposedPorts, portBindings } = this.buildPortConfiguration(options.ports);
    const binds = this.buildVolumeBinds(options.volumes);
    const restartPolicy = this.buildRestartPolicy(options.restartPolicy);

    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.image,
      Cmd: options.command,
      Entrypoint: options.entrypoint,
      WorkingDir: options.workdir,
      Hostname: options.hostname,
      Env: options.env ? Object.entries(options.env).map(([key, value]) => `${key}=${value}`) : undefined,
      Labels: options.labels,
      ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
      HostConfig: {
        PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
        Binds: binds.length > 0 ? binds : undefined,
        NetworkMode: options.networkMode,
        Privileged: options.privileged,
        RestartPolicy: restartPolicy,
      },
    });

    return container.id;
  }

  private buildPortConfiguration(ports?: ContainerCreateOptions["ports"]): {
    exposedPorts: Record<string, object>;
    portBindings: Record<string, { HostPort: string }[]>;
  } {
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, { HostPort: string }[]> = {};

    if (!ports) {
      return { exposedPorts, portBindings };
    }

    for (const portMapping of ports) {
      const protocol = portMapping.protocol ?? "tcp";
      const portKey = `${portMapping.container}/${protocol}`;
      exposedPorts[portKey] = {};
      portBindings[portKey] = [{ HostPort: portMapping.host?.toString() ?? "" }];
    }

    return { exposedPorts, portBindings };
  }

  private buildVolumeBinds(volumes?: ContainerCreateOptions["volumes"]): string[] {
    if (!volumes) {
      return [];
    }

    return volumes.map((volume) => {
      const mode = volume.readonly ? "ro" : "rw";
      return `${volume.source}:${volume.target}:${mode}`;
    });
  }

  private buildRestartPolicy(restartPolicy?: ContainerCreateOptions["restartPolicy"]): {
    Name: string;
    MaximumRetryCount?: number;
  } | undefined {
    if (!restartPolicy) {
      return undefined;
    }

    return {
      Name: restartPolicy.name,
      MaximumRetryCount: restartPolicy.maximumRetryCount,
    };
  }

  async startContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).start();
  }

  async stopContainer(id: string, timeout = 10): Promise<void> {
    try {
      await this.docker.getContainer(id).stop({ t: timeout });
    } catch (err) {
      if (!isNotRunningError(err) && !isNotFoundError(err)) throw err;
    }
  }

  async removeContainer(id: string, force = false): Promise<void> {
    try {
      await this.docker.getContainer(id).remove({ force });
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async restartContainer(id: string, timeout = 10): Promise<void> {
    await this.docker.getContainer(id).restart({ t: timeout });
  }

  async inspectContainer(id: string): Promise<ContainerInfo> {
    const info = await this.docker.getContainer(id).inspect();

    const ports: Record<number, number> = {};
    const portBindings = info.NetworkSettings.Ports;
    if (portBindings) {
      for (const [containerPort, bindings] of Object.entries(portBindings)) {
        if (!bindings?.[0]?.HostPort) continue;
        const port = parseInt(containerPort.split("/")[0]!, 10);
        ports[port] = parseInt(bindings[0].HostPort, 10);
      }
    }

    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ""),
      image: info.Config.Image,
      status: info.State.Status,
      state: toContainerState(info.State.Status),
      ports,
      labels: info.Config.Labels ?? {},
    };
  }

  async waitContainer(id: string): Promise<ExitResult> {
    const result = await this.docker.getContainer(id).wait();
    return { exitCode: result.StatusCode };
  }

  async containerExists(id: string): Promise<boolean> {
    try {
      await this.docker.getContainer(id).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async *streamLogs(id: string, options: { tail?: number } = {}): AsyncGenerator<LogChunk> {
    const stream = await this.docker.getContainer(id).logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: options.tail,
    });

    let buffer = Buffer.alloc(0);

    for await (const chunk of stream) {
      const chunkBuffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buffer = Buffer.concat([buffer, chunkBuffer]);

      while (buffer.length >= 8) {
        const streamType = buffer[0];
        const size = buffer.readUInt32BE(4);

        if (buffer.length < 8 + size) break;

        const frameData = buffer.subarray(8, 8 + size);
        buffer = buffer.subarray(8 + size);

        yield {
          stream: streamType === 1 ? "stdout" : "stderr",
          data: new Uint8Array(frameData),
        };
      }
    }
  }

  async createVolume(name: string, labels?: Record<string, string>): Promise<void> {
    await this.docker.createVolume({
      Name: name,
      Labels: labels,
    });
  }

  async removeVolume(name: string): Promise<void> {
    try {
      await this.docker.getVolume(name).remove();
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async volumeExists(name: string): Promise<boolean> {
    try {
      await this.docker.getVolume(name).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async cloneVolume(source: string, target: string, timeoutMs = 30000): Promise<void> {
    await this.createVolume(target);

    const containerId = await this.createContainer({
      image: ALPINE_IMAGE,
      command: VOLUME_CLONE_COMMAND,
      volumes: [
        { source, target: "/source", readonly: true },
        { source: target, target: "/target" },
      ],
    });

    try {
      await this.startContainer(containerId);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Volume clone timed out")), timeoutMs);
      });

      const waitResult = await Promise.race([this.waitContainer(containerId), timeoutPromise]);

      if (waitResult.exitCode !== 0) {
        await this.removeVolume(target);
        throw SandboxError.volumeCloneFailed(source, target, `exit code ${waitResult.exitCode}`);
      }
    } catch (error) {
      await this.removeVolume(target);
      await this.removeContainer(containerId, true);
      throw error;
    }

    await this.removeContainer(containerId, true);
  }

  async createNetwork(name: string, options: NetworkCreateOptions = {}): Promise<void> {
    await this.docker.createNetwork({
      Name: name,
      Driver: options.driver ?? "bridge",
      Labels: options.labels,
    });
  }

  async removeNetwork(name: string): Promise<void> {
    try {
      await this.docker.getNetwork(name).remove();
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async networkExists(name: string): Promise<boolean> {
    try {
      await this.docker.getNetwork(name).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async isConnectedToNetwork(containerIdOrName: string, networkName: string): Promise<boolean> {
    try {
      const networkInfo = await this.docker.getNetwork(networkName).inspect();
      const connectedContainers = networkInfo.Containers ?? {};

      return Object.entries(connectedContainers).some(([connectedId, containerInfo]) => {
        const matchesId = connectedId === containerIdOrName || connectedId.startsWith(containerIdOrName);
        const matchesName =
          containerInfo &&
          typeof containerInfo === "object" &&
          "Name" in containerInfo &&
          containerInfo.Name === containerIdOrName;
        return matchesId || matchesName;
      });
    } catch {
      return false;
    }
  }

  async connectToNetwork(
    containerId: string,
    networkName: string,
    options?: { aliases?: string[] },
  ): Promise<void> {
    await this.docker.getNetwork(networkName).connect({
      Container: containerId,
      EndpointConfig: options?.aliases ? { Aliases: options.aliases } : undefined,
    });
  }

  async disconnectFromNetwork(containerId: string, networkName: string): Promise<void> {
    try {
      await this.docker.getNetwork(networkName).disconnect({ Container: containerId });
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async exec(containerId: string, options: ExecOptions): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: options.command,
      WorkingDir: options.workdir,
      Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
      Tty: options.tty ?? false,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      let buffer = Buffer.alloc(0);

      stream.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Docker stream demuxing: 8-byte header per frame
        // Byte 0: stream type (1=stdout, 2=stderr)
        // Bytes 4-7: frame size (big-endian uint32)
        while (buffer.length >= 8) {
          const streamType = buffer[0];
          const size = buffer.readUInt32BE(4);

          if (buffer.length < 8 + size) break;

          const data = buffer.subarray(8, 8 + size);
          buffer = buffer.subarray(8 + size);

          if (streamType === 1) {
            stdout.push(data);
          } else if (streamType === 2) {
            stderr.push(data);
          }
        }
      });

      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const inspectResult = await exec.inspect();

    return {
      exitCode: inspectResult.ExitCode ?? 0,
      stdout: Buffer.concat(stdout).toString("utf-8"),
      stderr: Buffer.concat(stderr).toString("utf-8"),
    };
  }

  async *streamContainerEvents(options?: {
    filters?: { label?: string[]; container?: string[] };
  }): AsyncGenerator<DockerContainerEvent> {
    const filters: Record<string, string[]> = {
      type: ["container"],
      event: [
        "start",
        "stop",
        "die",
        "kill",
        "restart",
        "pause",
        "unpause",
        "oom",
        "health_status",
      ],
    };

    if (options?.filters?.label) {
      filters.label = options.filters.label;
    }

    if (options?.filters?.container) {
      filters.container = options.filters.container;
    }

    const stream = await this.docker.getEvents({ filters });

    for await (const chunk of stream) {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      for (const line of data.split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.Type !== "container") continue;

          yield {
            containerId: event.id ?? event.Actor?.ID,
            action: event.Action as DockerContainerEventAction,
            attributes: event.Actor?.Attributes ?? {},
            time: event.time ?? Math.floor(Date.now() / 1000),
          };
        } catch (error) {
          console.error("Failed to parse Docker event:", error);
        }
      }
    }
  }
}
