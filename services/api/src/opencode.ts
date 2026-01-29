import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

const opencodeUrl = process.env.OPENCODE_URL;
if (!opencodeUrl) {
  throw new Error("OPENCODE_URL environment variable is required");
}

export const opencode = createOpencodeClient({ baseUrl: opencodeUrl });
