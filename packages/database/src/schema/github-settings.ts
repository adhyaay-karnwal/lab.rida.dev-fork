import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Global GitHub settings table (single row, no project association).
 * Stores encrypted PAT and git author configuration.
 */
export const githubSettings = pgTable("github_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  patEncrypted: text("pat_encrypted"),
  patNonce: text("pat_nonce"),
  username: text("username"),
  authorName: text("author_name"),
  authorEmail: text("author_email"),
  attributeAgent: boolean("attribute_agent").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GitHubSettings = typeof githubSettings.$inferSelect;
export type NewGitHubSettings = typeof githubSettings.$inferInsert;
