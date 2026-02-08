export const TIMING = {
  COMMAND_TIMEOUT_MS: 30_000,
  RECORDING_MAX_MS: 300_000,
  RECORDING_MIN_MS: 1_000,
  RESTART_TIMEOUT_SECONDS: 10,
} as const;

export const LIMITS = {
  DEFAULT_LOG_TAIL: 100,
  DEFAULT_SCROLL_AMOUNT: 300,
} as const;

export const S3 = {
  REGION: "us-east-1",
} as const;

export const MCP_SERVER = {
  NAME: "lab-containers",
  VERSION: "1.0.0",
} as const;
