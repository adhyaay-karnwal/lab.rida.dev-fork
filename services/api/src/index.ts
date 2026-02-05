import { entry } from "@lab/entry-point";
import { type } from "arktype";
import {
  DockerClient,
  DockerNetworkManager,
  DockerRuntimeManager,
  DockerWorkspaceManager,
} from "@lab/sandbox-docker";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { createImageStoreFromEnv } from "@lab/context";
import { widelogger } from "@lab/widelogger";
import { VOLUMES } from "./config/constants";
import { ApiServer } from "./clients/server";
import { ContainerMonitor } from "./monitors/container.monitor";
import { OpenCodeMonitor } from "./monitors/opencode.monitor";
import { LogMonitor } from "./monitors/log.monitor";
import { PoolManager } from "./managers/pool.manager";
import { BrowserServiceManager } from "./managers/browser-service.manager";
import { SessionLifecycleManager } from "./managers/session-lifecycle.manager";
import { ProxyManager } from "./services/proxy.service";
import { createDefaultPromptService } from "./prompts/builder";
import { Sandbox } from "@lab/sandbox-sdk";
import { DeferredPublisher } from "./shared/deferred-publisher";
import { RedisClient } from "bun";

const { widelog } = widelogger({
  transport: (event) => process.stdout.write(JSON.stringify(event) + "\n"),
});

const envSchema = type({
  API_PORT: "string",
  OPENCODE_URL: "string",
  BROWSER_API_URL: "string",
  BROWSER_WS_HOST: "string = 'browser'",
  BROWSER_CLEANUP_DELAY_MS: "string.integer.parse = '10000'",
  RECONCILE_INTERVAL_MS: "string.integer.parse = '5000'",
  MAX_DAEMON_RETRIES: "string.integer.parse = '3'",
  BROWSER_SOCKET_VOLUME: "string = 'lab_browser_sockets'",
  BROWSER_CONTAINER_NAME: "string?",
  OPENCODE_CONTAINER_NAME: "string?",
  PROXY_CONTAINER_NAME: "string?",
  PROXY_BASE_DOMAIN: "string",
  POOL_SIZE: "string.integer.parse = '0'",
  GITHUB_CLIENT_ID: "string?",
  GITHUB_CLIENT_SECRET: "string?",
  GITHUB_CALLBACK_URL: "string?",
  FRONTEND_URL: "string?",
  REDIS_URL: "string = 'redis://localhost:6379'",
});

entry({
  name: "api",
  env: envSchema,
  setup: ({ env }) => {
    const dockerClient = new DockerClient();
    const sandbox = new Sandbox(dockerClient, {
      network: new DockerNetworkManager(dockerClient),
      workspace: new DockerWorkspaceManager(dockerClient, {
        workspacesVolume: VOLUMES.WORKSPACES,
        workspacesMount: "/workspaces",
      }),
      runtime: new DockerRuntimeManager(dockerClient, {
        workspacesSource: VOLUMES.WORKSPACES,
        workspacesTarget: "/workspaces",
        opencodeAuthSource: VOLUMES.OPENCODE_AUTH,
        opencodeAuthTarget: VOLUMES.OPENCODE_AUTH_TARGET,
        browserSocketSource: env.BROWSER_SOCKET_VOLUME,
        browserSocketTarget: VOLUMES.BROWSER_SOCKET_DIR,
      }),
    });

    const opencode = createOpencodeClient({ baseUrl: env.OPENCODE_URL });

    const containerNames = {
      browserContainerName: env.BROWSER_CONTAINER_NAME,
      opencodeContainerName: env.OPENCODE_CONTAINER_NAME,
    };

    const redis = new RedisClient(env.REDIS_URL);
    const proxyManager = new ProxyManager(env.PROXY_BASE_DOMAIN, redis);

    const deferredPublisher = new DeferredPublisher();

    const browserService = new BrowserServiceManager(
      {
        apiUrl: env.BROWSER_API_URL,
        wsHost: env.BROWSER_WS_HOST,
        cleanupDelayMs: env.BROWSER_CLEANUP_DELAY_MS,
        reconcileIntervalMs: env.RECONCILE_INTERVAL_MS,
        maxRetries: env.MAX_DAEMON_RETRIES,
      },
      deferredPublisher,
    );

    const sessionLifecycle = new SessionLifecycleManager(
      {
        containerNames,
      },
      sandbox,
      proxyManager,
      browserService,
      deferredPublisher,
    );

    const logMonitor = new LogMonitor(sandbox, deferredPublisher);
    const containerMonitor = new ContainerMonitor(sandbox, deferredPublisher);
    const openCodeMonitor = new OpenCodeMonitor(opencode, deferredPublisher);

    const promptService = createDefaultPromptService();
    const imageStore = createImageStoreFromEnv();

    const poolManager = new PoolManager(env.POOL_SIZE, browserService, sessionLifecycle);

    const server = new ApiServer(
      {
        containerNames,
        proxyBaseDomain: env.PROXY_BASE_DOMAIN,
        opencodeUrl: env.OPENCODE_URL,
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          callbackUrl: env.GITHUB_CALLBACK_URL,
        },
        frontendUrl: env.FRONTEND_URL,
      },
      {
        browserService,
        sessionLifecycle,
        poolManager,
        logMonitor,
        sandbox,
        opencode,
        promptService,
        imageStore,
        widelog,
      },
    );

    return {
      server,
      redis,
      deferredPublisher,
      browserService,
      sessionLifecycle,
      poolManager,
      logMonitor,
      containerMonitor,
      openCodeMonitor,
    };
  },
  main: async ({ env, extras }) => {
    const {
      server,
      redis,
      deferredPublisher,
      browserService,
      sessionLifecycle,
      poolManager,
      logMonitor,
      containerMonitor,
      openCodeMonitor,
    } = extras;

    await browserService.initialize();
    await sessionLifecycle.initialize();

    const publisher = await server.start(env.API_PORT);
    deferredPublisher.resolve(publisher);

    browserService.startReconciler();
    poolManager.initialize();
    logMonitor.start();
    containerMonitor.start(logMonitor);
    openCodeMonitor.start();

    return () => {
      containerMonitor.stop();
      openCodeMonitor.stop();
      logMonitor.stop();
      server.shutdown();
      redis.close();
    };
  },
});
