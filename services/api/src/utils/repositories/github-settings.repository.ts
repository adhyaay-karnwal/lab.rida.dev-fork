import { db } from "@lab/database/client";
import { githubSettings } from "@lab/database/schema/github-settings";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../crypto";

export interface GitHubSettingsInput {
  pat?: string;
  username?: string;
  authorName?: string;
  authorEmail?: string;
  attributeAgent?: boolean;
}

export interface GitHubSettingsOutput {
  id: string;
  username: string | null;
  authorName: string | null;
  authorEmail: string | null;
  attributeAgent: boolean;
  hasPatConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitHubCredentials {
  pat: string | null;
  username: string | null;
  authorName: string | null;
  authorEmail: string | null;
  attributeAgent: boolean;
}

export async function getGitHubSettings(): Promise<GitHubSettingsOutput | null> {
  const [settings] = await db.select().from(githubSettings).limit(1);
  if (!settings) return null;

  return {
    id: settings.id,
    username: settings.username,
    authorName: settings.authorName,
    authorEmail: settings.authorEmail,
    attributeAgent: settings.attributeAgent,
    hasPatConfigured: !!settings.patEncrypted,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

export async function getGitHubCredentials(): Promise<GitHubCredentials | null> {
  const [settings] = await db.select().from(githubSettings).limit(1);
  if (!settings) return null;

  let pat: string | null = null;
  if (settings.patEncrypted && settings.patNonce) {
    try {
      pat = decrypt(settings.patEncrypted, settings.patNonce);
    } catch {
      console.error("Failed to decrypt GitHub PAT");
    }
  }

  return {
    pat,
    username: settings.username,
    authorName: settings.authorName,
    authorEmail: settings.authorEmail,
    attributeAgent: settings.attributeAgent,
  };
}

export async function saveGitHubSettings(
  input: GitHubSettingsInput,
): Promise<GitHubSettingsOutput> {
  const [existing] = await db.select({ id: githubSettings.id }).from(githubSettings).limit(1);

  let patEncrypted: string | undefined;
  let patNonce: string | undefined;

  if (input.pat) {
    const encrypted = encrypt(input.pat);
    patEncrypted = encrypted.encrypted;
    patNonce = encrypted.nonce;
  }

  const values = {
    username: input.username,
    authorName: input.authorName,
    authorEmail: input.authorEmail,
    attributeAgent: input.attributeAgent,
    ...(patEncrypted && patNonce ? { patEncrypted, patNonce } : {}),
    updatedAt: new Date(),
  };

  let settings;
  if (existing) {
    [settings] = await db
      .update(githubSettings)
      .set(values)
      .where(eq(githubSettings.id, existing.id))
      .returning();
  } else {
    [settings] = await db.insert(githubSettings).values(values).returning();
  }

  if (!settings) throw new Error("Failed to save GitHub settings");

  return {
    id: settings.id,
    username: settings.username,
    authorName: settings.authorName,
    authorEmail: settings.authorEmail,
    attributeAgent: settings.attributeAgent,
    hasPatConfigured: !!settings.patEncrypted,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

export async function deleteGitHubSettings(): Promise<void> {
  await db.delete(githubSettings);
}
