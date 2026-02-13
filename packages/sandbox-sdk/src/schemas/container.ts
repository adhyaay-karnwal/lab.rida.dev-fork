import { z } from "zod";

export const PortMappingSchema = z.object({
  container: z.number().int().positive(),
  host: z.number().int().positive().optional(),
  protocol: z.enum(["tcp", "udp"]).optional(),
});

export const VolumeBindingSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  readonly: z.boolean().optional(),
});

export const ContainerCreateOptionsSchema = z.object({
  image: z.string().min(1),
  name: z.string().optional(),
  command: z.array(z.string()).optional(),
  entrypoint: z.array(z.string()).optional(),
  workdir: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  labels: z.record(z.string(), z.string()).optional(),
  hostname: z.string().optional(),
  ports: z.array(PortMappingSchema).optional(),
  volumes: z.array(VolumeBindingSchema).optional(),
  networkMode: z.string().optional(),
  networkAliases: z.array(z.string()).optional(),
  privileged: z.boolean().optional(),
});

export const ContainerStateSchema = z.enum([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
]);
