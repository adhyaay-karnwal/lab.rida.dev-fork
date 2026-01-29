import type { z } from "zod";

export function defineChannel<
  const TConfig extends {
    path: string;
    snapshot: z.ZodType;
    delta?: z.ZodType;
    event?: z.ZodType;
  },
>(config: TConfig): TConfig {
  return config;
}

export function defineSchema<
  const TChannels extends Record<string, ReturnType<typeof defineChannel>>,
  const TClientMessages extends z.ZodType,
>(config: {
  channels: TChannels;
  clientMessages: TClientMessages;
}): {
  channels: TChannels;
  clientMessages: TClientMessages;
} {
  return config;
}
