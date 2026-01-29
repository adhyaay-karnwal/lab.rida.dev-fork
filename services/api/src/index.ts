import { server } from "./server";
import { startContainerMonitor } from "./container-monitor";

console.log(`API server running on http://localhost:${server.port}`);

startContainerMonitor();
