import { tool } from "ai";
import { z } from "zod";
import { searchSessionsWithProject } from "../../repositories/session.repository";
import { resolveWorkspacePathBySession } from "../../shared/path-resolver";
import type { OpencodeClient } from "../../types/dependencies";
import { extractTextFromParts, isOpencodeMessage } from "../opencode-messages";

const inputSchema = z.object({
  query: z.string().describe("The search query to find relevant sessions"),
  limit: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of results to return"),
});

interface ScoredResult {
  relevantContent: string;
  score: number;
}

function scoreMessageContent(
  rawMessages: unknown,
  queryLower: string,
  queryLength: number
): ScoredResult | null {
  const messages = Array.isArray(rawMessages)
    ? rawMessages.filter(isOpencodeMessage)
    : [];

  for (const msg of messages) {
    const text = extractTextFromParts(msg.parts);
    const textLower = text.toLowerCase();
    if (textLower.includes(queryLower)) {
      const index = textLower.indexOf(queryLower);
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + queryLength + 50);
      return {
        relevantContent: `...${text.slice(start, end)}...`,
        score: 1.0,
      };
    }
  }
  return null;
}

function scoreRow(
  row: { title: string | null; projectName: string },
  rawMessages: unknown,
  queryLower: string,
  queryLength: number
): ScoredResult {
  let relevantContent = "";
  let score = 0;

  if (row.title?.toLowerCase().includes(queryLower)) {
    relevantContent = row.title;
    score = 0.8;
  }

  if (row.projectName.toLowerCase().includes(queryLower)) {
    score = Math.max(score, 0.6);
  }

  if (rawMessages) {
    const messageResult = scoreMessageContent(
      rawMessages,
      queryLower,
      queryLength
    );
    if (messageResult) {
      relevantContent = messageResult.relevantContent;
      score = messageResult.score;
    }
  }

  return { relevantContent, score };
}

export function createSearchSessionsTool(opencode: OpencodeClient) {
  return tool({
    description:
      "Searches across session titles and conversation content to find relevant sessions. Returns matching sessions with relevant content snippets.",
    inputSchema,

    execute: async ({ query, limit }) => {
      const searchLimit = limit ?? 5;

      const rows = await searchSessionsWithProject({ query, limit });

      const messagePromises = rows.map(async (row) => {
        if (!row.opencodeSessionId) {
          return null;
        }
        try {
          const directory = await resolveWorkspacePathBySession(row.id);
          const response = await opencode.session.messages({
            sessionID: row.opencodeSessionId,
            directory,
          });
          return response.data ?? [];
        } catch {
          return null;
        }
      });

      const allMessages = await Promise.all(messagePromises);
      const queryLower = query.toLowerCase();

      const results: Array<{
        sessionId: string;
        projectName: string;
        title: string | null;
        relevantContent: string;
        score: number;
      }> = [];

      for (const [i, row] of rows.entries()) {
        if (results.length >= searchLimit) {
          break;
        }

        const { relevantContent, score } = scoreRow(
          row,
          allMessages[i],
          queryLower,
          query.length
        );

        if (score > 0) {
          results.push({
            sessionId: row.id,
            projectName: row.projectName,
            title: row.title,
            relevantContent,
            score,
          });
        }
      }

      results.sort((a, b) => b.score - a.score);

      return { results: results.slice(0, searchLimit) };
    },
  });
}
