import { server } from "./server";
import { startContainerMonitor } from "./container-monitor";
import { startOpenCodeMonitor } from "./opencode-monitor";

console.log(`API server running on http://localhost:${server.port}`);

startContainerMonitor();
startOpenCodeMonitor();
