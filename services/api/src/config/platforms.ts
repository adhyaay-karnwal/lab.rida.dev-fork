/**
 * Platform-specific configuration for the chat orchestrator.
 */

interface PlatformConfig {
  /**
   * When true, stream the response and break on double newlines,
   * returning multiple messages instead of one.
   */
  breakDoubleNewlines: boolean;
}

const defaultConfig: PlatformConfig = {
  breakDoubleNewlines: false,
};

const platformConfigs: Record<string, Partial<PlatformConfig>> = {
  imessage: {
    breakDoubleNewlines: true,
  },
};

/**
 * Get the configuration for a platform.
 * Falls back to default config for unknown platforms.
 */
export function getPlatformConfig(platformOrigin: string): PlatformConfig {
  const platformConfig = platformConfigs[platformOrigin.toLowerCase()];
  return {
    ...defaultConfig,
    ...platformConfig,
  };
}
