import type { DockerClient } from "@lab/sandbox-docker";
import type { env } from "../env";

export type Config = (typeof env)["inferOut"];

export interface ToolContext {
  docker: DockerClient;
  config: Config;
}
