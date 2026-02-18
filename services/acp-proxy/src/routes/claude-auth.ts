import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { restartAllAgentProcesses } from "../agent-process";

type AuthFlowState =
  | "idle"
  | "starting"
  | "url_ready"
  | "awaiting_code"
  | "connected"
  | "error";

interface ClaudeAuthSnapshot {
  flow: {
    state: AuthFlowState;
    loginUrl: string | null;
    error: string | null;
    startedAt: string | null;
    updatedAt: string | null;
    processAlive: boolean;
  };
  auth: Record<string, unknown> | null;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface StoredOAuthToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes: string[];
  subscriptionType?: string | null;
  rateLimitTier?: string | null;
}

interface AuthFlowSession {
  state: string;
  codeVerifier: string;
}

interface AuthEvent {
  id: number;
  type: "status";
  status: ClaudeAuthSnapshot;
}

type Subscriber = (event: AuthEvent) => void;

const LOGIN_URL_PATTERN = /https:\/\/claude\.ai\/oauth\/authorize\S*/;
const WHITESPACE_PATTERN = /\s+/;
const AUTH_TOKEN_PATH = "/home/agent/.claude/oauth-token.json";
const CLAUDE_CONFIG_PATH = "/home/agent/.claude.json";
const CLAUDE_AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
];

function toJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.length > 0) {
      return maybeMessage;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function toErrorText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      output += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return output;
}

function base64UrlEncode(value: Buffer): string {
  return value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64UrlEncode(randomBytes(48));
  const codeChallenge = base64UrlEncode(
    createHash("sha256").update(codeVerifier).digest()
  );
  return { codeVerifier, codeChallenge };
}

function parseSubmittedCode(rawInput: string): {
  code: string;
  state: string | null;
} {
  const input = rawInput.trim();
  if (!input) {
    return { code: "", state: null };
  }

  if (
    LOGIN_URL_PATTERN.test(input) ||
    input.startsWith("http://") ||
    input.startsWith("https://")
  ) {
    try {
      const url = new URL(input);
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state");
      if (code) {
        return { code, state };
      }
    } catch {
      // Fall through to non-URL parsing.
    }
  }

  if (input.includes("#")) {
    const [code, state] = input.split("#");
    return { code: code ?? "", state: state ?? null };
  }

  return { code: input, state: null };
}

async function runClaudeCommand(args: string[]): Promise<CommandResult> {
  const childProcess = globalThis.Bun.spawn(
    ["npx", "-y", "@anthropic-ai/claude-code", ...args],
    {
      cwd: "/workspaces",
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    }
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    childProcess.exited,
    childProcess.stdout ? readText(childProcess.stdout) : Promise.resolve(""),
    childProcess.stderr ? readText(childProcess.stderr) : Promise.resolve(""),
  ]);

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

class ClaudeAuthFlowManager {
  private state: AuthFlowState = "idle";
  private loginUrl: string | null = null;
  private error: string | null = null;
  private startedAt: string | null = null;
  private updatedAt: string | null = null;
  private auth: Record<string, unknown> | null = null;
  private flowSession: AuthFlowSession | null = null;
  private token: StoredOAuthToken | null = null;
  private readonly subscribers = new Set<Subscriber>();
  private readonly eventBuffer: AuthEvent[] = [];
  private eventCounter = 0;
  private readonly initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.loadToken();
  }

  async startLogin(): Promise<ClaudeAuthSnapshot> {
    await this.initPromise;
    await this.refreshAuth();
    if (this.auth?.loggedIn === true) {
      this.setState("connected");
      this.loginUrl = null;
      this.error = null;
      this.emit();
      return this.snapshot();
    }

    this.startedAt = new Date().toISOString();
    this.updatedAt = this.startedAt;
    this.error = null;
    this.setState("starting");

    const { codeVerifier, codeChallenge } = createPkcePair();
    const state = base64UrlEncode(randomBytes(32));
    const url = new URL(CLAUDE_AUTH_URL);
    url.searchParams.set("code", "true");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);

    this.flowSession = { state, codeVerifier };
    this.loginUrl = url.toString();
    this.setState("awaiting_code");
    this.emit();

    return this.snapshot();
  }

  async getStatus(): Promise<ClaudeAuthSnapshot> {
    await this.initPromise;
    await this.refreshAuth();
    if (this.auth?.loggedIn === true && this.state !== "connected") {
      this.setState("connected");
      this.loginUrl = null;
      this.error = null;
    }
    if (this.auth?.loggedIn === false && this.state === "connected") {
      this.setState("idle");
    }
    return this.snapshot();
  }

  async logout(): Promise<ClaudeAuthSnapshot> {
    await this.initPromise;
    this.flowSession = null;
    this.loginUrl = null;
    this.error = null;
    this.startedAt = null;
    this.token = null;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = undefined;
    await rm(AUTH_TOKEN_PATH, { force: true }).catch(() => undefined);
    await this.clearClaudeOauthFromConfig();

    const result = await runClaudeCommand(["auth", "logout"]).catch((error) => {
      this.failFlow(getErrorMessage(error));
      return null;
    });

    if (result && result.exitCode !== 0) {
      const errorMessage = result.stderr || result.stdout || "Logout failed";
      this.failFlow(errorMessage);
      return this.snapshot();
    }

    this.auth = {
      loggedIn: false,
      authMethod: "none",
      apiProvider: "firstParty",
    };
    await restartAllAgentProcesses("claude auth logout");
    this.setState("idle");
    return this.snapshot();
  }

  async submitCode(code: string): Promise<ClaudeAuthSnapshot> {
    await this.initPromise;
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      this.failFlow("Missing authentication code");
      return this.snapshot();
    }

    if (!this.flowSession) {
      this.failFlow("No active auth process awaiting a code");
      return this.snapshot();
    }

    try {
      const parsed = parseSubmittedCode(trimmedCode);
      if (!parsed.code) {
        this.failFlow("Invalid authentication code format");
        return this.snapshot();
      }

      if (parsed.state && parsed.state !== this.flowSession.state) {
        this.failFlow(
          "Authentication code state does not match current login flow"
        );
        return this.snapshot();
      }

      this.setState("starting");
      const token = await this.exchangeAuthorizationCode(
        parsed.code,
        this.flowSession.codeVerifier,
        this.flowSession.state
      );
      this.token = token;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token.accessToken;
      await this.persistToken(token);

      this.auth = {
        loggedIn: true,
        authMethod: "oauth_token",
        apiProvider: "firstParty",
      };
      this.flowSession = null;
      this.loginUrl = null;
      this.error = null;
      await restartAllAgentProcesses("claude auth login updated");
      this.setState("connected");
    } catch (error) {
      this.failFlow(getErrorMessage(error));
    }

    return this.snapshot();
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getEventsSince(lastId: number): AuthEvent[] {
    if (lastId < 0) {
      return [...this.eventBuffer];
    }
    return this.eventBuffer.filter((event) => event.id > lastId);
  }

  private snapshot(): ClaudeAuthSnapshot {
    return {
      flow: {
        state: this.state,
        loginUrl: this.loginUrl,
        error: this.error,
        startedAt: this.startedAt,
        updatedAt: this.updatedAt,
        processAlive: false,
      },
      auth: this.auth,
    };
  }

  private setState(next: AuthFlowState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    this.touch();
    this.emit();
  }

  private touch(): void {
    this.updatedAt = new Date().toISOString();
  }

  private emit(): void {
    const event: AuthEvent = {
      id: this.eventCounter++,
      type: "status",
      status: this.snapshot(),
    };
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > 256) {
      this.eventBuffer.shift();
    }
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  private failFlow(message: string): void {
    this.error = message;
    this.setState("error");
  }

  private async loadToken(): Promise<void> {
    try {
      const rawConfig = await readFile(CLAUDE_CONFIG_PATH, "utf8");
      const parsedConfig = JSON.parse(rawConfig) as {
        claudeAiOauth?: {
          accessToken?: string;
          refreshToken?: string | null;
          expiresAt?: number | null;
          scopes?: string[];
          subscriptionType?: string | null;
          rateLimitTier?: string | null;
        };
      };
      const stored = parsedConfig.claudeAiOauth;
      if (stored?.accessToken) {
        this.token = {
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken ?? null,
          expiresAt:
            typeof stored.expiresAt === "number" ? stored.expiresAt : null,
          scopes: Array.isArray(stored.scopes)
            ? stored.scopes.filter(
                (scope): scope is string => typeof scope === "string"
              )
            : ["user:inference"],
          subscriptionType: stored.subscriptionType ?? null,
          rateLimitTier: stored.rateLimitTier ?? null,
        };
        process.env.CLAUDE_CODE_OAUTH_TOKEN = this.token.accessToken;
        return;
      }
    } catch {
      // Fall back to legacy token file.
    }

    try {
      const raw = await readFile(AUTH_TOKEN_PATH, "utf8");
      const parsed = JSON.parse(raw) as StoredOAuthToken;
      if (!parsed.accessToken) {
        return;
      }
      this.token = parsed;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = parsed.accessToken;
      await this.persistClaudeOauthToConfig(parsed).catch(() => undefined);
    } catch {
      // No persisted token yet.
    }
  }

  private async persistToken(token: StoredOAuthToken): Promise<void> {
    await mkdir(dirname(AUTH_TOKEN_PATH), { recursive: true });
    await writeFile(AUTH_TOKEN_PATH, JSON.stringify(token, null, 2), "utf8");
    await this.persistClaudeOauthToConfig(token);
  }

  private async persistClaudeOauthToConfig(
    token: StoredOAuthToken
  ): Promise<void> {
    const currentConfigRaw = await readFile(CLAUDE_CONFIG_PATH, "utf8").catch(
      () => "{}"
    );
    const currentConfig = JSON.parse(currentConfigRaw) as Record<
      string,
      unknown
    >;
    currentConfig.claudeAiOauth = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scopes: token.scopes,
      subscriptionType: token.subscriptionType ?? null,
      rateLimitTier: token.rateLimitTier ?? null,
    };
    await writeFile(
      CLAUDE_CONFIG_PATH,
      JSON.stringify(currentConfig, null, 2),
      "utf8"
    );
  }

  private async clearClaudeOauthFromConfig(): Promise<void> {
    const currentConfigRaw = await readFile(CLAUDE_CONFIG_PATH, "utf8").catch(
      () => "{}"
    );
    const currentConfig = JSON.parse(currentConfigRaw) as Record<
      string,
      unknown
    >;
    currentConfig.claudeAiOauth = undefined;
    await writeFile(
      CLAUDE_CONFIG_PATH,
      JSON.stringify(currentConfig, null, 2),
      "utf8"
    );
  }

  private async refreshTokenIfNeeded(): Promise<void> {
    if (!(this.token?.refreshToken && this.token.expiresAt)) {
      return;
    }
    if (Date.now() < this.token.expiresAt - 60_000) {
      return;
    }

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: this.token.refreshToken,
        client_id: CLIENT_ID,
        scope: SCOPES.join(" "),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    } | null;

    if (!(response.ok && payload?.access_token)) {
      throw new Error(
        toErrorText(payload?.error_description) ||
          toErrorText(payload?.error) ||
          `Token refresh failed (${response.status})`
      );
    }

    const scopes = payload.scope
      ? payload.scope.split(WHITESPACE_PATTERN).filter(Boolean)
      : this.token.scopes;
    this.token = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? this.token.refreshToken,
      expiresAt:
        typeof payload.expires_in === "number"
          ? Date.now() + payload.expires_in * 1000
          : this.token.expiresAt,
      scopes,
    };
    process.env.CLAUDE_CODE_OAUTH_TOKEN = this.token.accessToken;
    await this.persistToken(this.token);
  }

  private async exchangeAuthorizationCode(
    authorizationCode: string,
    codeVerifier: string,
    state: string
  ): Promise<StoredOAuthToken> {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: authorizationCode,
        client_id: CLIENT_ID,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI,
        state,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    } | null;

    if (!(response.ok && payload?.access_token)) {
      throw new Error(
        toErrorText(payload?.error_description) ||
          toErrorText(payload?.error) ||
          `Token exchange failed (${response.status})`
      );
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresAt:
        typeof payload.expires_in === "number"
          ? Date.now() + payload.expires_in * 1000
          : null,
      scopes: payload.scope
        ? payload.scope.split(WHITESPACE_PATTERN).filter(Boolean)
        : ["user:inference"],
    };
  }

  private async refreshAuth(): Promise<void> {
    try {
      if (this.token) {
        await this.refreshTokenIfNeeded().catch(() => undefined);
      }
      const result = await runClaudeCommand(["auth", "status", "--json"]);
      if (result.exitCode !== 0 || !result.stdout) {
        this.auth = {
          loggedIn: false,
          authMethod: "none",
          apiProvider: "firstParty",
        };
        return;
      }
      this.auth = toJson(JSON.parse(result.stdout));
    } catch {
      this.auth = {
        loggedIn: false,
        authMethod: "none",
        apiProvider: "firstParty",
      };
    }
    this.touch();
    this.emit();
  }
}

const claudeAuthFlowManager = new ClaudeAuthFlowManager();

export async function handleStartClaudeAuth(): Promise<Response> {
  const status = await claudeAuthFlowManager.startLogin();
  return Response.json(status);
}

export async function handleGetClaudeAuthStatus(): Promise<Response> {
  const status = await claudeAuthFlowManager.getStatus();
  return Response.json(status);
}

export async function handleLogoutClaudeAuth(): Promise<Response> {
  const status = await claudeAuthFlowManager.logout();
  return Response.json(status);
}

export async function handleSubmitClaudeAuthCode(
  request: Request
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) {
    return Response.json(
      { error: "Missing authentication code" },
      { status: 400 }
    );
  }

  const status = await claudeAuthFlowManager.submitCode(code);
  return Response.json(status);
}

export function handleClaudeAuthEvents(request: Request): Response {
  const lastEventIdHeader = request.headers.get("Last-Event-ID");
  const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : -1;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const replay = claudeAuthFlowManager.getEventsSince(lastEventId);
      for (const event of replay) {
        const frame = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      }

      const unsubscribe = claudeAuthFlowManager.subscribe((event) => {
        try {
          const frame = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(frame));
        } catch {
          unsubscribe();
        }
      });

      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        },
        { once: true }
      );
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
