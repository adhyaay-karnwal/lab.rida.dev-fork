export type {
  DockerClientOptions,
  DockerContainerEvent,
  DockerContainerEventAction,
} from "./types/client";
export {
  DockerClientOptionsSchema,
  DockerContainerEventActionSchema,
} from "./types/client";

export { DockerClient } from "./clients/docker-client";
export { PortAllocator } from "./clients/port-allocator";

export {
  DEFAULT_SOCKET_PATH,
  DEFAULT_DOCKER_PORT,
  DEFAULT_DOCKER_PROTOCOL,
  ALPINE_IMAGE,
  VOLUME_CLONE_COMMAND,
} from "./constants";

export {
  hasStatusCode,
  isNotFoundError,
  isNotRunningError,
  wrapDockerError,
} from "./utils/error-handling";
export { toContainerState } from "./utils/container-state";

export { DockerWorkspaceManager } from "./modules/docker-workspace-manager";
export { DockerNetworkManager } from "./modules/docker-network-manager";
export { DockerImageManager } from "./modules/docker-image-manager";
export { DockerContainerManager } from "./modules/docker-container-manager";
export { DockerVolumeManager } from "./modules/docker-volume-manager";
export { DockerRuntimeManager, type DockerRuntimeManagerConfig } from "./modules/docker-runtime-manager";
export { NetworkOperations } from "./modules/network-operations";
export { ExecOperations } from "./modules/exec-operations";
export { DockerEventStream } from "./modules/docker-event-stream";
