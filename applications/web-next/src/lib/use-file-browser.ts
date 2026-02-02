"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import { createOpencodeClient, type FileContent } from "@opencode-ai/sdk/v2/client";
import { useFileStatuses, type ChangedFile } from "./use-file-statuses";
import type { BrowserState, BrowserActions, FileNode, FileStatus } from "@/components/review";

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

function createSessionClient(labSessionId: string) {
  return createOpencodeClient({
    baseUrl: `${getApiUrl()}/opencode`,
    headers: { "X-Lab-Session-Id": labSessionId },
  });
}

type Patch = NonNullable<FileContent["patch"]>;

function getParentPaths(filePath: string): string[] {
  const segments = filePath.split("/");
  const parents: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    parents.push(segments.slice(0, i).join("/"));
  }

  return parents;
}

function buildStatusMaps(files: ChangedFile[]): {
  statuses: Map<string, FileStatus>;
  dirsWithChanges: Set<string>;
} {
  const statuses = new Map<string, FileStatus>();
  const dirsWithChanges = new Set<string>();

  for (const file of files) {
    statuses.set(file.path, file.status);
    for (const parentPath of getParentPaths(file.path)) {
      dirsWithChanges.add(parentPath);
    }
  }

  return { statuses, dirsWithChanges };
}

async function fetchRootFiles(sessionId: string): Promise<FileNode[]> {
  const client = createSessionClient(sessionId);
  const response = await client.file.list({ path: "." });

  if (response.data) {
    return response.data.map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      ignored: node.ignored,
    }));
  }

  return [];
}

export function useFileBrowser(sessionId: string | null): {
  state: BrowserState;
  actions: BrowserActions;
} {
  const { files: changedFiles, isLoading: statusesLoading } = useFileStatuses(sessionId);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedContents, setLoadedContents] = useState<Map<string, FileNode[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewPatch, setPreviewPatch] = useState<Patch | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const client = useMemo(() => {
    if (!sessionId) return null;
    return createSessionClient(sessionId);
  }, [sessionId]);

  const { data: rootNodes, isLoading: rootLoading } = useSWR<FileNode[]>(
    sessionId ? `file-browser-root-${sessionId}` : null,
    () => fetchRootFiles(sessionId!),
  );

  const { statuses: fileStatuses, dirsWithChanges: directoriesWithChanges } = useMemo(
    () => buildStatusMaps(changedFiles),
    [changedFiles],
  );

  const initializedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedSessionRef.current === sessionId) return;
    initializedSessionRef.current = sessionId;

    setExpandedPaths(new Set());
    setLoadedContents(new Map());
    setLoadingPaths(new Set());
    setSelectedPath(null);
    setPreviewContent(null);
    setPreviewPatch(null);
  }, [sessionId]);

  const toggleDirectory = useCallback(
    async (path: string) => {
      if (expandedPaths.has(path)) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }

      if (!loadedContents.has(path) && client) {
        setLoadingPaths((prev) => new Set([...prev, path]));

        try {
          const response = await client.file.list({ path });

          if (response.data) {
            const nodes: FileNode[] = response.data.map((node) => ({
              name: node.name,
              path: node.path,
              type: node.type,
              ignored: node.ignored,
            }));
            setLoadedContents((prev) => new Map(prev).set(path, nodes));
          }
        } catch (error) {
          console.error("Failed to fetch directory contents:", error);
        } finally {
          setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }

      setExpandedPaths((prev) => new Set([...prev, path]));
    },
    [client, expandedPaths, loadedContents],
  );

  const selectFile = useCallback(
    async (path: string) => {
      if (!client) return;

      setSelectedPath(path);
      setPreviewLoading(true);
      setPreviewContent(null);
      setPreviewPatch(null);

      try {
        const response = await client.file.read({ path });

        if (!response.data || response.data.type !== "text") return;

        setPreviewContent(response.data.content);
        setPreviewPatch(response.data.patch ?? null);
      } catch (error) {
        console.error("Failed to read file:", error);
      } finally {
        setPreviewLoading(false);
      }
    },
    [client],
  );

  const clearFileSelection = useCallback(() => {
    setSelectedPath(null);
    setPreviewContent(null);
    setPreviewPatch(null);
  }, []);

  const loadDirectoryContents = useCallback(
    async (dirPath: string) => {
      if (!client || loadedContents.has(dirPath)) return;

      try {
        const response = await client.file.list({ path: dirPath });
        if (response.data) {
          const nodes: FileNode[] = response.data.map((node) => ({
            name: node.name,
            path: node.path,
            type: node.type,
            ignored: node.ignored,
          }));
          setLoadedContents((prev) => new Map(prev).set(dirPath, nodes));
        }
      } catch (error) {
        console.error("Failed to fetch directory contents:", error);
      }
    },
    [client, loadedContents],
  );

  const expandToFile = useCallback(
    async (filePath: string) => {
      const parents = getParentPaths(filePath);
      await Promise.all(parents.map(loadDirectoryContents));
      setExpandedPaths(new Set(parents));
    },
    [loadDirectoryContents],
  );

  const state: BrowserState = {
    rootNodes: rootNodes ?? [],
    expandedPaths,
    loadedContents,
    loadingPaths,
    rootLoading: rootLoading || statusesLoading,
    selectedPath,
    previewContent,
    previewPatch,
    previewLoading,
    fileStatuses,
    directoriesWithChanges,
  };

  const actions: BrowserActions = {
    toggleDirectory,
    selectFile,
    clearFileSelection,
    expandToFile,
  };

  return { state, actions };
}
