import { z } from "zod";

export const StartCommand = z.object({
  type: z.literal("start"),
  sessionId: z.string().uuid(),
  port: z.number().int().positive(),
  url: z.string().optional(),
});
export type StartCommand = z.infer<typeof StartCommand>;

export const StopCommand = z.object({
  type: z.literal("stop"),
  sessionId: z.string().uuid(),
});
export type StopCommand = z.infer<typeof StopCommand>;

export const NavigateCommand = z.object({
  type: z.literal("navigate"),
  sessionId: z.string().uuid(),
  url: z.string(),
});
export type NavigateCommand = z.infer<typeof NavigateCommand>;

export const GetStatusCommand = z.object({
  type: z.literal("get_status"),
  sessionId: z.string().uuid(),
});
export type GetStatusCommand = z.infer<typeof GetStatusCommand>;

export const PingCommand = z.object({
  type: z.literal("ping"),
});
export type PingCommand = z.infer<typeof PingCommand>;

export const DaemonCommand = z.discriminatedUnion("type", [
  StartCommand,
  StopCommand,
  NavigateCommand,
  GetStatusCommand,
  PingCommand,
]);
export type DaemonCommand = z.infer<typeof DaemonCommand>;
