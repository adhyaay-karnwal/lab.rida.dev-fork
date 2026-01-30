import { portAllocationFailed } from "../types/errors";
import { type PortRange, DEFAULT_PORT_RANGE } from "../types/schema";

export interface PortAllocator {
  allocate(): number;
  release(port: number): void;
  isAllocated(port: number): boolean;
  reserve(port: number): void;
}

export const createPortAllocator = (
  range: PortRange = DEFAULT_PORT_RANGE,
  initialPorts: number[] = [],
): PortAllocator => {
  const allocatedPorts = new Set<number>(initialPorts);

  return {
    allocate() {
      for (let port = range.start; port <= range.end; port++) {
        if (!allocatedPorts.has(port)) {
          allocatedPorts.add(port);
          return port;
        }
      }
      throw portAllocationFailed(`No available ports in range ${range.start}-${range.end}`);
    },

    release(port) {
      allocatedPorts.delete(port);
    },

    isAllocated(port) {
      return allocatedPorts.has(port);
    },

    reserve(port) {
      allocatedPorts.add(port);
    },
  };
};
