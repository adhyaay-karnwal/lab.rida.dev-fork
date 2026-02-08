export const SESSION_STATUS = {
  RUNNING: "running",
  POOLED: "pooled",
  DELETING: "deleting",
  ERROR: "error",
} as const;

type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];
