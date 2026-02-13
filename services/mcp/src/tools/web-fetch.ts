import { isIP } from "node:net";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CHARS = 20_000;
const MAX_RESPONSE_BYTES = 1_500_000;
const SCRIPT_TAG_REGEX = /<script[\s\S]*?<\/script>/gi;
const STYLE_TAG_REGEX = /<style[\s\S]*?<\/style>/gi;
const NOSCRIPT_TAG_REGEX = /<noscript[\s\S]*?<\/noscript>/gi;
const HTML_BREAK_TAG_REGEX =
  /<\/?(p|div|section|article|li|ul|ol|h[1-6]|br|tr|table|thead|tbody)[^>]*>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
const CARRIAGE_RETURN_REGEX = /\r/g;
const TRAILING_SPACES_REGEX = /[ \t]+\n/g;
const EXCESS_NEWLINES_REGEX = /\n{3,}/g;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

function clampTimeout(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.max(1000, Math.min(MAX_TIMEOUT_MS, Math.floor(timeoutMs)));
}

function clampMaxChars(maxChars: number | undefined): number {
  if (typeof maxChars !== "number" || !Number.isFinite(maxChars)) {
    return DEFAULT_MAX_CHARS;
  }
  return Math.max(500, Math.min(200_000, Math.floor(maxChars)));
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some(Number.isNaN)) {
    return false;
  }

  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  if (first === 10 || first === 127) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  return first === 192 && second === 168;
}

function isPrivateIpv6(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  if (lowered === "::1") {
    return true;
  }
  if (lowered.startsWith("fc") || lowered.startsWith("fd")) {
    return true;
  }
  return lowered.startsWith("fe8") || lowered.startsWith("fe9");
}

function isBlockedHost(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  if (
    lowered === "localhost" ||
    lowered === "host.docker.internal" ||
    lowered.endsWith(".local")
  ) {
    return true;
  }

  const ipVersion = isIP(lowered);
  if (ipVersion === 4) {
    return isPrivateIpv4(lowered);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(lowered);
  }

  return false;
}

function removeHtmlTags(value: string): string {
  const withoutScripts = value
    .replace(SCRIPT_TAG_REGEX, " ")
    .replace(STYLE_TAG_REGEX, " ")
    .replace(NOSCRIPT_TAG_REGEX, " ");

  const withLineBreaks = withoutScripts.replace(HTML_BREAK_TAG_REGEX, "\n");

  return withLineBreaks.replace(HTML_TAG_REGEX, " ");
}

function decodeBasicEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(CARRIAGE_RETURN_REGEX, "")
    .replace(TRAILING_SPACES_REGEX, "\n")
    .replace(EXCESS_NEWLINES_REGEX, "\n\n")
    .trim();
}

function extractHtmlTitle(html: string): string | null {
  const titleMatch = html.match(TITLE_REGEX);
  if (!titleMatch?.[1]) {
    return null;
  }
  const title = normalizeWhitespace(
    decodeBasicEntities(removeHtmlTags(titleMatch[1]))
  );
  return title.length > 0 ? title : null;
}

function extractReadableBody(contentType: string, bodyText: string): string {
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return normalizeWhitespace(bodyText);
    }
  }

  if (contentType.includes("text/html")) {
    const withoutTags = removeHtmlTags(bodyText);
    const decoded = decodeBasicEntities(withoutTags);
    return normalizeWhitespace(decoded);
  }

  return normalizeWhitespace(bodyText);
}

function truncateOutput(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n\n... [truncated ${value.length - maxChars} chars]`;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: abortController.signal,
      headers: {
        "user-agent": "lab-webfetch/1.0 (+https://agentclientprotocol.com)",
        accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function validatePublicHttpUrl(rawUrl: string): URL | string {
  const parsedUrl = new URL(rawUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return "Only http/https URLs are supported";
  }
  if (isBlockedHost(parsedUrl.hostname)) {
    return "Blocked host: private/local network addresses are not allowed";
  }
  return parsedUrl;
}

function validateResponseSize(
  response: Response
): { ok: true } | { ok: false; message: string } {
  const contentLengthHeader = response.headers.get("content-length");
  const declaredLength = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : null;

  if (declaredLength && declaredLength > MAX_RESPONSE_BYTES) {
    return {
      ok: false,
      message: `Response too large (${declaredLength} bytes). Max allowed is ${MAX_RESPONSE_BYTES}.`,
    };
  }

  return { ok: true };
}

function formatWebFetchResult(
  parsedUrl: URL,
  response: Response,
  rawBody: string,
  maxChars: number
): string {
  const contentType = response.headers.get("content-type") ?? "unknown";
  const title = contentType.includes("text/html")
    ? extractHtmlTitle(rawBody)
    : null;
  const body = truncateOutput(
    extractReadableBody(contentType, rawBody),
    maxChars
  );

  const lines = [
    `URL: ${response.url || parsedUrl.toString()}`,
    `Status: ${response.status} ${response.statusText}`.trim(),
    `Content-Type: ${contentType}`,
    title ? `Title: ${title}` : null,
    "",
    body || "[empty response body]",
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

async function executeWebFetch(args: {
  url: string;
  timeoutMs?: number;
  maxChars?: number;
}) {
  const parsedUrlOrError = validatePublicHttpUrl(args.url);
  if (typeof parsedUrlOrError === "string") {
    return errorResult(parsedUrlOrError);
  }

  const timeoutMs = clampTimeout(args.timeoutMs);
  const maxChars = clampMaxChars(args.maxChars);
  const response = await fetchWithTimeout(
    parsedUrlOrError.toString(),
    timeoutMs
  );

  const sizeValidation = validateResponseSize(response);
  if (!sizeValidation.ok) {
    return errorResult(sizeValidation.message);
  }

  const rawBody = await response.text();
  if (rawBody.length > MAX_RESPONSE_BYTES) {
    return errorResult(
      `Response too large (${rawBody.length} bytes). Max allowed is ${MAX_RESPONSE_BYTES}.`
    );
  }

  return textResult(
    formatWebFetchResult(parsedUrlOrError, response, rawBody, maxChars)
  );
}

export function webFetch(server: McpServer): void {
  server.registerTool(
    "WebFetch",
    {
      description:
        "Fetch a public web URL and return readable page content with metadata.",
      inputSchema: {
        url: z.string().url().describe("HTTP/HTTPS URL to fetch"),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(MAX_TIMEOUT_MS)
          .optional()
          .describe("Request timeout in milliseconds"),
        maxChars: z
          .number()
          .int()
          .min(500)
          .max(200_000)
          .optional()
          .describe("Maximum characters returned"),
      },
    },
    async (args) => {
      try {
        return await executeWebFetch(args);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Web fetch failed";
        return errorResult(message);
      }
    }
  );
}
