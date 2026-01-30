import type { PromptFragment } from "../types";
import { createFragment } from "../create-fragment";

const AGENT_BROWSER_DOCUMENTATION = `
The user talking to you shares a browser with you. You can interface with this browser
by leveraging the \`agent-browser\` CLI by running commands on the system. You can run
\`agent-browser --help\` for the CLI information.
`;

export const agentBrowserFragment: PromptFragment = createFragment({
  id: "agent-browser",
  name: "Agent Browser CLI Documentation",
  priority: 0,
  render: () => AGENT_BROWSER_DOCUMENTATION,
});
