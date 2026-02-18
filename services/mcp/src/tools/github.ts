import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";
import {
  type CommandNode,
  createHierarchicalTool,
  defineCommand,
  type ToolResult,
} from "../utils/hierarchical-tool";

interface GitHubCredentials {
  token: string;
  username: string;
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
}

interface GitHubClientContext {
  credentials: GitHubCredentials;
  octokit: Octokit;
}

type RepoVisibility = "public" | "private" | "internal";
type HeaderValue = string | number | string[] | undefined;
interface FullNameUrl {
  full_name: string;
  html_url: string;
}
interface HtmlUrlNumber {
  html_url: string;
  number: number;
}
interface HtmlUrlIdNumber {
  html_url: string;
  id: number;
}
interface HtmlUrlIdString {
  html_url: string;
  id: string;
}

interface AuthUserResponse {
  login: string;
  html_url: string;
}

interface RepoDetailsResponse extends FullNameUrl {
  description: string | null;
  default_branch: string;
  private: boolean;
}

interface BranchResponse {
  name: string;
  protected: boolean;
  commit: { sha: string };
}

interface PullRequestListResponse {
  number: number;
  title: string;
  html_url: string;
  state: string;
}

interface PullRequestMergeResponse {
  sha: string;
  merged: boolean;
  message: string;
}

interface IssueListResponse {
  number: number;
  title: string;
  html_url: string;
  state: string;
  pull_request?: unknown;
}

interface OrganizationResponse {
  login: string;
  name: string | null;
  description: string | null;
  html_url: string;
}

interface ReleaseListResponse {
  id: number;
  name: string | null;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
}

interface WorkflowListResponse {
  workflows: { id: number; name: string; state: string; path: string }[];
}

interface WorkflowRunsResponse {
  workflow_runs: {
    id: number;
    name: string | null;
    status: string;
    conclusion: string | null;
    html_url: string;
    head_branch: string;
  }[];
}

interface CacheListResponse {
  actions_caches: {
    id: number;
    key: string;
    ref: string;
    size_in_bytes: number;
    last_accessed_at: string;
  }[];
}

interface CodespacesResponse {
  codespaces: {
    name: string;
    state: string;
    repository: { full_name: string };
    web_url: string;
  }[];
}

interface GistListEntry {
  id: string;
  description: string | null;
  html_url: string;
  public: boolean;
}

interface PullRequestHeadResponse {
  head: { sha: string };
}

interface CommitStatusResponse {
  state: string;
  statuses: { context: string; state: string; description: string }[];
}

interface CheckRunsResponse {
  check_runs: {
    name: string;
    status: string;
    conclusion: string | null;
  }[];
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function notConfiguredError(): ToolResult {
  return errorResult(
    "GitHub not configured. Connect your account in Settings."
  );
}

function statusIcon(state: string): string {
  if (state === "success") {
    return "+";
  }
  if (state === "failure" || state === "timed_out" || state === "cancelled") {
    return "x";
  }
  return "-";
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function toHeaders(input: Record<string, HeaderValue> | undefined): Headers {
  const headers = new Headers();
  if (!input) {
    return headers;
  }

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
      continue;
    }
    if (typeof value === "number") {
      headers.set(key, String(value));
      continue;
    }
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return headers;
}

function toPerPageLimit(limit: number | undefined, fallback: number): number {
  return limit ?? fallback;
}

async function githubApi<T>(
  octokit: Octokit,
  method: string,
  endpoint: string,
  params?: Record<string, unknown>
): Promise<ApiResult<T>> {
  try {
    const response = await octokit.request(`${method} ${endpoint}`, params);
    return {
      ok: true,
      status: response.status,
      data: response.data as T,
      headers: toHeaders(response.headers),
    };
  } catch (error) {
    if (error instanceof RequestError) {
      const data = (error.response?.data ?? { message: error.message }) as T;

      return {
        ok: false,
        status: error.status,
        data,
        headers: toHeaders(error.response?.headers),
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      status: 500,
      data: { message } as T,
      headers: new Headers(),
    };
  }
}

function formatApiError(prefix: string, result: ApiResult<unknown>): string {
  return `${prefix} (HTTP ${result.status}): ${JSON.stringify(result.data)}`;
}

function formatReviews(
  reviews: { user: { login: string }; state: string; body: string }[]
): string[] {
  if (reviews.length === 0) {
    return [];
  }

  const lines = ["## Reviews", ""];
  for (const review of reviews) {
    lines.push(`**${review.user.login}** (${review.state})`);
    if (review.body) {
      lines.push(review.body);
    }
    lines.push("");
  }
  return lines;
}

function formatInlineComments(
  comments: {
    user: { login: string };
    body: string;
    path: string;
    line: number | null;
  }[]
): string[] {
  if (comments.length === 0) {
    return [];
  }

  const lines = ["## Inline Comments", ""];
  for (const comment of comments) {
    const location = comment.line
      ? `${comment.path}:${comment.line}`
      : comment.path;
    lines.push(`**${comment.user.login}** on \`${location}\``);
    lines.push(comment.body);
    lines.push("");
  }
  return lines;
}

function formatCommitStatuses(
  statuses: { context: string; state: string; description: string }[]
): string[] {
  if (statuses.length === 0) {
    return [];
  }

  const lines = ["### Commit Statuses"];
  for (const status of statuses) {
    lines.push(
      `[${statusIcon(status.state)}] ${status.context}: ${status.description || status.state}`
    );
  }
  lines.push("");
  return lines;
}

function formatCheckRuns(
  checkRuns: { name: string; status: string; conclusion: string | null }[]
): string[] {
  if (checkRuns.length === 0) {
    return [];
  }

  const lines = ["### Check Runs"];
  for (const check of checkRuns) {
    const state =
      check.status === "completed"
        ? check.conclusion || "completed"
        : check.status;
    lines.push(`[${statusIcon(state)}] ${check.name}: ${state}`);
  }
  return lines;
}

function parseVisibility(
  value: RepoVisibility | undefined
): RepoVisibility | undefined {
  return value;
}

type ResolvedRef = { ok: true; ref: string } | { ok: false; error: ToolResult };

async function resolveStatusRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  refInput: string
): Promise<ResolvedRef> {
  if (!refInput.startsWith("pr:")) {
    return { ok: true, ref: refInput };
  }

  const pullRequestNumber = refInput.slice(3);
  const pullRequestResult = await githubApi<PullRequestHeadResponse>(
    octokit,
    "GET",
    `/repos/${owner}/${repo}/pulls/${pullRequestNumber}`
  );

  if (!pullRequestResult.ok) {
    return {
      ok: false,
      error: errorResult(
        formatApiError("Error fetching PR", pullRequestResult)
      ),
    };
  }

  return { ok: true, ref: pullRequestResult.data.head.sha };
}

export function github(server: McpServer, { config }: ToolContext) {
  async function getGitHubCredentials(): Promise<GitHubCredentials | null> {
    const response = await fetch(
      `${config.API_BASE_URL}/internal/github/credentials`
    );
    if (!response.ok) {
      return null;
    }
    return response.json();
  }

  async function withCredentials(
    execute: (context: GitHubClientContext) => Promise<ToolResult>
  ): Promise<ToolResult> {
    const credentials = await getGitHubCredentials();
    if (!credentials) {
      return notConfiguredError();
    }
    return execute({
      credentials,
      octokit: new Octokit({
        auth: credentials.token,
        userAgent: "lab-mcp-github/1.0.0",
      }),
    });
  }

  const githubTree: Record<string, CommandNode> = {
    auth: {
      description: "Authentication and identity operations",
      children: {
        status: {
          description: "Show GitHub auth status and token scopes",
          handler: async () =>
            withCredentials(async ({ octokit }) => {
              const userResult = await githubApi<AuthUserResponse>(
                octokit,
                "GET",
                "/user"
              );

              if (!userResult.ok) {
                return errorResult(
                  formatApiError("Error fetching auth status", userResult)
                );
              }

              const scopes = userResult.headers.get("x-oauth-scopes") || "none";
              return textResult(
                `Authenticated as ${userResult.data.login}\nProfile: ${userResult.data.html_url}\nToken scopes: ${scopes}`
              );
            }),
        },
      },
    },
    repo: {
      description: "Repository operations",
      children: {
        get: {
          description: "Get repository details",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const result = await githubApi<RepoDetailsResponse>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error fetching repository", result)
                );
              }

              const visibility = result.data.private ? "private" : "public";
              return textResult(
                `${result.data.full_name} (${visibility})\n${result.data.description || "(no description)"}\nDefault branch: ${result.data.default_branch}\n${result.data.html_url}`
              );
            }),
        },
        list: defineCommand({
          description: "List repositories for a user or org",
          params: {
            owner: z
              .string()
              .optional()
              .describe("Username/org; defaults to authenticated user"),
            type: z
              .enum(["all", "owner", "member"])
              .optional()
              .describe("Repository filter"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of repos"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const limit = toPerPageLimit(args.limit, 30);
              const { type = "owner", owner = "" } = args;

              const endpoint = owner
                ? `/users/${owner}/repos?per_page=${limit}&type=${type}`
                : `/user/repos?per_page=${limit}&affiliation=owner,collaborator,organization_member`;

              const result = await githubApi<RepoDetailsResponse[]>(
                octokit,
                "GET",
                endpoint
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing repositories", result)
                );
              }

              if (result.data.length === 0) {
                return textResult("No repositories found.");
              }

              const output = result.data
                .map((repository) => {
                  const visibility = repository.private ? "private" : "public";
                  return `${repository.full_name} (${visibility})\n  ${repository.html_url}`;
                })
                .join("\n\n");

              return textResult(output);
            }),
        }),
        create: defineCommand({
          description: "Create a repository for user or organization",
          params: {
            name: z.string().describe("Repository name"),
            description: z
              .string()
              .optional()
              .describe("Repository description"),
            visibility: z
              .enum(["public", "private", "internal"])
              .optional()
              .describe("Repository visibility"),
            owner: z
              .string()
              .optional()
              .describe("Organization login (omit for personal repos)"),
            autoInit: z.boolean().optional().describe("Initialize with README"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const {
                owner = "",
                description,
                autoInit,
                visibility: rawVisibility,
              } = args;
              const visibility = parseVisibility(rawVisibility) ?? "public";
              const endpoint = owner ? `/orgs/${owner}/repos` : "/user/repos";

              const result = await githubApi<FullNameUrl>(
                octokit,
                "POST",
                endpoint,
                {
                  name: args.name,
                  description,
                  private: visibility !== "public",
                  visibility: visibility === "private" ? undefined : visibility,
                  auto_init: autoInit ?? false,
                }
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error creating repository", result)
                );
              }

              return textResult(
                `Repository created: ${result.data.full_name}\n${result.data.html_url}`
              );
            }),
        }),
        update: defineCommand({
          description: "Update repository details",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            name: z.string().optional().describe("New repository name"),
            description: z
              .string()
              .optional()
              .describe("New repository description"),
            homepage: z.string().optional().describe("Homepage URL"),
            defaultBranch: z.string().optional().describe("New default branch"),
            visibility: z
              .enum(["public", "private", "internal"])
              .optional()
              .describe("Repository visibility"),
            archived: z
              .boolean()
              .optional()
              .describe("Set repository archive state"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const {
                visibility: rawVisibility,
                name,
                description,
                homepage,
                defaultBranch,
                archived,
              } = args;
              const visibility = parseVisibility(rawVisibility);

              const result = await githubApi<FullNameUrl>(
                octokit,
                "PATCH",
                `/repos/${args.owner}/${args.repo}`,
                {
                  name,
                  description,
                  homepage,
                  default_branch: defaultBranch,
                  private:
                    visibility === undefined
                      ? undefined
                      : visibility !== "public",
                  visibility:
                    visibility === undefined || visibility === "private"
                      ? undefined
                      : visibility,
                  archived,
                }
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error updating repository", result)
                );
              }

              return textResult(
                `Repository updated: ${result.data.full_name}\n${result.data.html_url}`
              );
            }),
        }),
        branches: defineCommand({
          description: "List repository branches",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of branches"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const limit = toPerPageLimit(args.limit, 30);

              const result = await githubApi<BranchResponse[]>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}/branches?per_page=${limit}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing branches", result)
                );
              }

              if (result.data.length === 0) {
                return textResult("No branches found.");
              }

              return textResult(
                result.data
                  .map(
                    (branch) =>
                      `${branch.name}${branch.protected ? " (protected)" : ""} - ${branch.commit.sha.slice(0, 7)}`
                  )
                  .join("\n")
              );
            }),
        }),
      },
    },
    pr: {
      description: "Pull request operations",
      children: {
        create: {
          description: "Create a pull request",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            title: z.string().describe("PR title"),
            body: z.string().optional().describe("PR description"),
            head: z.string().describe("Branch with changes"),
            base: z.string().describe("Target branch (for example main)"),
            draft: z.boolean().optional().describe("Create as draft"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const result = await githubApi<HtmlUrlNumber>(
                octokit,
                "POST",
                `/repos/${args.owner}/${args.repo}/pulls`,
                {
                  title: args.title,
                  body: args.body,
                  head: args.head,
                  base: args.base,
                  draft: args.draft,
                }
              );

              if (!result.ok) {
                return errorResult(formatApiError("Error creating PR", result));
              }

              return textResult(
                `PR #${result.data.number} created: ${result.data.html_url}`
              );
            }),
        },
        list: defineCommand({
          description: "List pull requests",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            state: z
              .enum(["open", "closed", "all"])
              .optional()
              .describe("Filter by state"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const { state = "open" } = args;
              const result = await githubApi<PullRequestListResponse[]>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}/pulls?state=${state}`
              );

              if (!result.ok) {
                return errorResult(formatApiError("Error listing PRs", result));
              }

              if (result.data.length === 0) {
                return textResult("No pull requests found.");
              }

              return textResult(
                result.data
                  .map(
                    (pullRequest) =>
                      `#${pullRequest.number}: ${pullRequest.title} (${pullRequest.state})\n  ${pullRequest.html_url}`
                  )
                  .join("\n\n")
              );
            }),
        }),
        comments: {
          description: "Get PR reviews and comments",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            number: z.number().describe("PR number"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const [reviewsResult, commentsResult] = await Promise.all([
                githubApi<
                  { user: { login: string }; state: string; body: string }[]
                >(
                  octokit,
                  "GET",
                  `/repos/${args.owner}/${args.repo}/pulls/${args.number}/reviews`
                ),
                githubApi<
                  {
                    user: { login: string };
                    body: string;
                    path: string;
                    line: number | null;
                  }[]
                >(
                  octokit,
                  "GET",
                  `/repos/${args.owner}/${args.repo}/pulls/${args.number}/comments`
                ),
              ]);

              if (!(reviewsResult.ok && commentsResult.ok)) {
                const failed = reviewsResult.ok
                  ? commentsResult
                  : reviewsResult;
                return errorResult(
                  formatApiError("Error fetching PR comments", failed)
                );
              }

              const sections = [
                ...formatReviews(reviewsResult.data),
                ...formatInlineComments(commentsResult.data),
              ];

              if (sections.length === 0) {
                return textResult("No reviews or comments on this PR.");
              }

              return textResult(sections.join("\n"));
            }),
        },
        merge: defineCommand({
          description: "Merge a pull request",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            number: z.number().describe("PR number"),
            method: z
              .enum(["merge", "squash", "rebase"])
              .optional()
              .describe("Merge strategy"),
            commitTitle: z
              .string()
              .optional()
              .describe("Custom merge commit title"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const { method = "merge", commitTitle } = args;
              const result = await githubApi<PullRequestMergeResponse>(
                octokit,
                "PUT",
                `/repos/${args.owner}/${args.repo}/pulls/${args.number}/merge`,
                {
                  merge_method: method,
                  commit_title: commitTitle,
                }
              );

              if (!(result.ok && result.data.merged)) {
                return errorResult(formatApiError("Error merging PR", result));
              }

              return textResult(
                `PR #${args.number} merged.\nCommit: ${result.data.sha}\n${result.data.message}`
              );
            }),
        }),
      },
    },
    issue: {
      description: "Issue operations",
      children: {
        create: {
          description: "Create an issue",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            title: z.string().describe("Issue title"),
            body: z.string().optional().describe("Issue description"),
            labels: z.array(z.string()).optional().describe("Labels to add"),
            assignees: z
              .array(z.string())
              .optional()
              .describe("Users to assign"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const result = await githubApi<HtmlUrlNumber>(
                octokit,
                "POST",
                `/repos/${args.owner}/${args.repo}/issues`,
                {
                  title: args.title,
                  body: args.body,
                  labels: args.labels,
                  assignees: args.assignees,
                }
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error creating issue", result)
                );
              }

              return textResult(
                `Issue #${result.data.number} created: ${result.data.html_url}`
              );
            }),
        },
        list: defineCommand({
          description: "List issues",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            state: z
              .enum(["open", "closed", "all"])
              .optional()
              .describe("Filter by state"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of issues"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const state = args.state ?? "open";
              const limit = toPerPageLimit(args.limit, 30);

              const result = await githubApi<IssueListResponse[]>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}/issues?state=${state}&per_page=${limit}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing issues", result)
                );
              }

              const issues = result.data.filter(
                (item) => !("pull_request" in toJsonObject(item))
              );

              if (issues.length === 0) {
                return textResult("No issues found.");
              }

              return textResult(
                issues
                  .map(
                    (issueEntry) =>
                      `#${issueEntry.number}: ${issueEntry.title} (${issueEntry.state})\n  ${issueEntry.html_url}`
                  )
                  .join("\n\n")
              );
            }),
        }),
      },
    },
    org: {
      description: "Organization operations",
      children: {
        get: {
          description: "Get organization details",
          params: {
            org: z.string().describe("Organization login"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const result = await githubApi<OrganizationResponse>(
                octokit,
                "GET",
                `/orgs/${args.org}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error fetching organization", result)
                );
              }

              return textResult(
                `${result.data.login}${result.data.name ? ` (${result.data.name})` : ""}\n${result.data.description || "(no description)"}\n${result.data.html_url}`
              );
            }),
        },
        repos: defineCommand({
          description: "List organization repositories",
          params: {
            org: z.string().describe("Organization login"),
            type: z
              .enum(["all", "public", "private", "forks", "sources", "member"])
              .optional()
              .describe("Repository filter"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of repositories"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const limit = toPerPageLimit(args.limit, 30);
              const { type = "all" } = args;
              const result = await githubApi<RepoDetailsResponse[]>(
                octokit,
                "GET",
                `/orgs/${args.org}/repos?type=${type}&per_page=${limit}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing organization repos", result)
                );
              }

              if (result.data.length === 0) {
                return textResult("No organization repositories found.");
              }

              return textResult(
                result.data
                  .map(
                    (repository) =>
                      `${repository.full_name} (${repository.private ? "private" : "public"})\n  ${repository.html_url}`
                  )
                  .join("\n\n")
              );
            }),
        }),
      },
    },
    release: {
      description: "Release operations",
      children: {
        list: defineCommand({
          description: "List repository releases",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of releases"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const limit = toPerPageLimit(args.limit, 20);
              const result = await githubApi<ReleaseListResponse[]>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}/releases?per_page=${limit}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing releases", result)
                );
              }

              if (result.data.length === 0) {
                return textResult("No releases found.");
              }

              return textResult(
                result.data
                  .map(
                    (releaseEntry) =>
                      `${releaseEntry.tag_name} - ${releaseEntry.name || "(unnamed)"}${releaseEntry.draft ? " (draft)" : ""}${releaseEntry.prerelease ? " (prerelease)" : ""}\n  ${releaseEntry.html_url}`
                  )
                  .join("\n\n")
              );
            }),
        }),
        create: defineCommand({
          description: "Create a release",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            tag: z.string().describe("Tag name"),
            name: z.string().optional().describe("Release title"),
            body: z.string().optional().describe("Release notes"),
            targetCommitish: z
              .string()
              .optional()
              .describe("Target branch or commit"),
            draft: z.boolean().optional().describe("Create as draft"),
            prerelease: z.boolean().optional().describe("Mark as prerelease"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const { name, body, targetCommitish, draft, prerelease } = args;
              const result = await githubApi<HtmlUrlIdNumber>(
                octokit,
                "POST",
                `/repos/${args.owner}/${args.repo}/releases`,
                {
                  tag_name: args.tag,
                  name,
                  body,
                  target_commitish: targetCommitish,
                  draft: draft ?? false,
                  prerelease: prerelease ?? false,
                }
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error creating release", result)
                );
              }

              return textResult(
                `Release created (id ${result.data.id}): ${result.data.html_url}`
              );
            }),
        }),
      },
    },
    workflow: {
      description: "GitHub Actions workflow operations",
      children: {
        list: defineCommand({
          description: "List repository workflows",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const result = await githubApi<WorkflowListResponse>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}/actions/workflows`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing workflows", result)
                );
              }

              if (result.data.workflows.length === 0) {
                return textResult("No workflows found.");
              }

              return textResult(
                result.data.workflows
                  .map(
                    (workflowEntry) =>
                      `${workflowEntry.name} [${workflowEntry.id}] (${workflowEntry.state})\n  ${workflowEntry.path}`
                  )
                  .join("\n\n")
              );
            }),
        }),
        dispatch: {
          description: "Dispatch a workflow run",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            workflowId: z
              .union([z.string(), z.number()])
              .describe("Workflow file name or workflow ID"),
            ref: z.string().describe("Branch or tag ref"),
            inputs: z
              .record(z.string(), z.string())
              .optional()
              .describe("Workflow inputs"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const result = await githubApi<unknown>(
                octokit,
                "POST",
                `/repos/${args.owner}/${args.repo}/actions/workflows/${String(args.workflowId)}/dispatches`,
                {
                  ref: args.ref,
                  inputs: args.inputs,
                }
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error dispatching workflow", result)
                );
              }

              return textResult("Workflow dispatch request submitted.");
            }),
        },
      },
    },
    run: {
      description: "GitHub Actions run operations",
      children: {
        list: defineCommand({
          description: "List workflow runs",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            branch: z.string().optional().describe("Filter by branch"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of runs"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const limit = toPerPageLimit(args.limit, 20);
              const { branch } = args;
              const query = new URLSearchParams({
                per_page: String(limit),
                ...(branch ? { branch } : {}),
              });
              const result = await githubApi<WorkflowRunsResponse>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}/actions/runs?${query.toString()}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing workflow runs", result)
                );
              }

              if (result.data.workflow_runs.length === 0) {
                return textResult("No workflow runs found.");
              }

              return textResult(
                result.data.workflow_runs
                  .map((runEntry) => {
                    const state =
                      runEntry.status === "completed"
                        ? runEntry.conclusion || "completed"
                        : runEntry.status;
                    return `Run ${runEntry.id} (${runEntry.name || "unnamed"}) [${runEntry.head_branch}]: ${state}\n  ${runEntry.html_url}`;
                  })
                  .join("\n\n")
              );
            }),
        }),
        rerun: {
          description: "Rerun a workflow run",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            runId: z.number().describe("Workflow run ID"),
            failedOnly: z
              .boolean()
              .optional()
              .describe("Rerun only failed jobs"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const endpoint = args.failedOnly
                ? `/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}/rerun-failed-jobs`
                : `/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}/rerun`;
              const result = await githubApi<unknown>(
                octokit,
                "POST",
                endpoint
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error rerunning workflow run", result)
                );
              }

              return textResult(`Rerun requested for run ${args.runId}.`);
            }),
        },
        cancel: {
          description: "Cancel a workflow run",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            runId: z.number().describe("Workflow run ID"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const result = await githubApi<unknown>(
                octokit,
                "POST",
                `/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}/cancel`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error cancelling workflow run", result)
                );
              }

              return textResult(`Cancel requested for run ${args.runId}.`);
            }),
        },
      },
    },
    cache: {
      description: "GitHub Actions cache operations",
      children: {
        list: defineCommand({
          description: "List repository Actions caches",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            key: z.string().optional().describe("Filter by cache key"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const { key } = args;
              const query = new URLSearchParams();
              if (key && key.length > 0) {
                query.set("key", key);
              }

              const result = await githubApi<CacheListResponse>(
                octokit,
                "GET",
                `/repos/${args.owner}/${args.repo}/actions/caches${query.size > 0 ? `?${query.toString()}` : ""}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing caches", result)
                );
              }

              if (result.data.actions_caches.length === 0) {
                return textResult("No Actions caches found.");
              }

              return textResult(
                result.data.actions_caches
                  .map(
                    (cacheEntry) =>
                      `${cacheEntry.id} ${cacheEntry.key} [${cacheEntry.ref}] ${Math.round(cacheEntry.size_in_bytes / 1024)} KB (last used ${cacheEntry.last_accessed_at})`
                  )
                  .join("\n")
              );
            }),
        }),
        delete: defineCommand({
          description: "Delete caches by key",
          params: {
            owner: z.string().describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            key: z.string().describe("Cache key"),
            ref: z.string().optional().describe("Branch/tag ref filter"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const { key, ref } = args;
              const query = new URLSearchParams({ key });
              if (ref && ref.length > 0) {
                query.set("ref", ref);
              }

              const result = await githubApi<unknown>(
                octokit,
                "DELETE",
                `/repos/${args.owner}/${args.repo}/actions/caches?${query.toString()}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error deleting cache", result)
                );
              }

              return textResult("Cache deletion request completed.");
            }),
        }),
      },
    },
    codespace: {
      description: "Codespaces operations",
      children: {
        list: defineCommand({
          description: "List your codespaces",
          params: {
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of codespaces"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const limit = toPerPageLimit(args.limit, 20);
              const result = await githubApi<CodespacesResponse>(
                octokit,
                "GET",
                `/user/codespaces?per_page=${limit}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing codespaces", result)
                );
              }

              if (result.data.codespaces.length === 0) {
                return textResult("No codespaces found.");
              }

              return textResult(
                result.data.codespaces
                  .map(
                    (codespaceEntry) =>
                      `${codespaceEntry.name} (${codespaceEntry.state}) - ${codespaceEntry.repository.full_name}\n  ${codespaceEntry.web_url}`
                  )
                  .join("\n\n")
              );
            }),
        }),
      },
    },
    gist: {
      description: "Gist operations",
      children: {
        list: defineCommand({
          description: "List your gists",
          params: {
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Maximum number of gists"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const limit = toPerPageLimit(args.limit, 20);
              const result = await githubApi<GistListEntry[]>(
                octokit,
                "GET",
                `/gists?per_page=${limit}`
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error listing gists", result)
                );
              }

              if (result.data.length === 0) {
                return textResult("No gists found.");
              }

              return textResult(
                result.data
                  .map(
                    (gistEntry) =>
                      `${gistEntry.id} (${gistEntry.public ? "public" : "private"}) ${gistEntry.description || "(no description)"}\n  ${gistEntry.html_url}`
                  )
                  .join("\n\n")
              );
            }),
        }),
        create: defineCommand({
          description: "Create a gist",
          params: {
            description: z.string().optional().describe("Gist description"),
            filename: z.string().describe("Filename"),
            content: z.string().describe("File content"),
            public: z.boolean().optional().describe("Create as public gist"),
          },
          handler: async (args) =>
            withCredentials(async ({ octokit }) => {
              const { filename, description, public: isPublic } = args;
              const result = await githubApi<HtmlUrlIdString>(
                octokit,
                "POST",
                "/gists",
                {
                  description,
                  public: isPublic ?? false,
                  files: {
                    [filename]: {
                      content: args.content,
                    },
                  },
                }
              );

              if (!result.ok) {
                return errorResult(
                  formatApiError("Error creating gist", result)
                );
              }

              return textResult(
                `Gist created (${result.data.id}): ${result.data.html_url}`
              );
            }),
        }),
      },
    },
    status: defineCommand({
      description: "Get CI status for a commit or PR",
      params: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        ref: z.string().describe("Commit SHA, branch, or pr:NUMBER"),
      },
      handler: async (args) =>
        withCredentials(async ({ octokit }) => {
          const resolvedRef = await resolveStatusRef(
            octokit,
            args.owner,
            args.repo,
            args.ref
          );
          if (!resolvedRef.ok) {
            return resolvedRef.error;
          }
          const ref = resolvedRef.ref;

          const [statusResult, checksResult] = await Promise.all([
            githubApi<CommitStatusResponse>(
              octokit,
              "GET",
              `/repos/${args.owner}/${args.repo}/commits/${ref}/status`
            ),
            githubApi<CheckRunsResponse>(
              octokit,
              "GET",
              `/repos/${args.owner}/${args.repo}/commits/${ref}/check-runs`
            ),
          ]);

          const sections = [`## Status for ${ref.slice(0, 7)}`, ""];

          if (statusResult.ok) {
            sections.push(`Overall: **${statusResult.data.state}**`, "");
            sections.push(...formatCommitStatuses(statusResult.data.statuses));
          }

          if (checksResult.ok) {
            sections.push(...formatCheckRuns(checksResult.data.check_runs));
          }

          if (!(statusResult.ok || checksResult.ok)) {
            return errorResult(
              `Error fetching statuses: ${JSON.stringify({
                status: statusResult.data,
                checks: checksResult.data,
              })}`
            );
          }

          return textResult(sections.join("\n"));
        }),
    }),
  };

  createHierarchicalTool(server, {
    name: "GitHub",
    description:
      "GitHub operations (auth, repos, pull requests, issues, orgs, releases, actions, caches, codespaces, gists)",
    tree: githubTree,
  });
}
