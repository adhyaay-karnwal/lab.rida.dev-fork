import type { Session } from "@lab/client";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api } from "./api";

const preferredModelAtom = atomWithStorage<string | null>(
  "preferred-model",
  null
);

function usePreferredModel() {
  return useAtom(preferredModelAtom);
}

interface UseModelSelectionOptions {
  syncTo?: (modelId: string) => void;
  currentSyncedValue?: string | null;
}

export function useModelSelection(options?: UseModelSelectionOptions) {
  const { data: modelGroups, isLoading } = useModels();
  const [preferredModel, setPreferredModel] = usePreferredModel();

  const modelId = (() => {
    if (!modelGroups) {
      return null;
    }

    const allModels = modelGroups.flatMap(({ models }) => models);
    const validModel = allModels.find(({ value }) => value === preferredModel);
    const fallback = modelGroups[0]?.models[0];

    return validModel?.value ?? fallback?.value ?? null;
  })();

  useEffect(() => {
    if (modelId && options?.syncTo && options.currentSyncedValue === null) {
      options.syncTo(modelId);
    }
  }, [modelId, options]);

  const setModelId = (value: string) => {
    setPreferredModel(value);
    options?.syncTo?.(value);
  };

  return { modelGroups, modelId, setModelId, isLoading };
}

export function useProjects() {
  return useSWR("projects", () => api.projects.list());
}

interface ModelGroup {
  provider: string;
  models: { label: string; value: string }[];
}

function useModels() {
  return useSWR("models", async () => {
    const response = await api.models.list();

    const groupMap = new Map<string, ModelGroup>();
    for (const model of response.models) {
      const existing = groupMap.get(model.providerId);
      const entry = {
        label: model.name,
        value: `${model.providerId}/${model.modelId}`,
      };

      if (existing) {
        existing.models.push(entry);
      } else {
        groupMap.set(model.providerId, {
          provider: model.providerName,
          models: [entry],
        });
      }
    }

    return Array.from(groupMap.values());
  });
}

export function useSessions(projectId: string | null) {
  return useSWR(
    projectId ? `sessions-${projectId}` : null,
    () => {
      if (!projectId) {
        return [];
      }
      return api.sessions.list(projectId);
    },
    { keepPreviousData: true }
  );
}

export function useSession(sessionId: string | null) {
  const isOptimistic = sessionId === OPTIMISTIC_SESSION_ID;

  return useSWR(
    sessionId ? `session-${sessionId}` : null,
    isOptimistic
      ? null
      : () => {
          if (!sessionId) {
            return null;
          }
          return api.sessions.get(sessionId);
        }
  );
}

interface CreateSessionOptions {
  title?: string;
  initialMessage?: string;
}

const OPTIMISTIC_SESSION_ID = "new";

export function useCreateSession() {
  const { mutate } = useSWRConfig();

  return (projectId: string, options: CreateSessionOptions = {}): Session => {
    const { title, initialMessage } = options;
    const now = new Date().toISOString();

    const optimisticSession: Session = {
      id: OPTIMISTIC_SESSION_ID,
      projectId,
      title: title ?? null,
      opencodeSessionId: null,
      status: "creating",
      createdAt: now,
      updatedAt: now,
    };

    const sessionsKey = `sessions-${projectId}`;

    mutate(`session-${OPTIMISTIC_SESSION_ID}`, optimisticSession, {
      revalidate: false,
    });

    mutate(
      sessionsKey,
      async (current: Session[] = []) => {
        const session = await api.sessions.create(projectId, {
          title,
          initialMessage,
        });

        mutate(`session-${session.id}`, session, { revalidate: false });
        mutate(`session-${OPTIMISTIC_SESSION_ID}`, session, {
          revalidate: false,
        });

        return current.map((existing) =>
          existing.id === OPTIMISTIC_SESSION_ID ? session : existing
        );
      },
      {
        optimisticData: (current = []) => [...current, optimisticSession],
        rollbackOnError: true,
        revalidate: true,
      }
    );

    return optimisticSession;
  };
}

export function useDeleteSession() {
  const { mutate } = useSWRConfig();

  return (session: Session, onDeleted: () => void) => {
    const cacheKey = `sessions-${session.projectId}`;

    mutate(cacheKey, () => api.sessions.delete(session.id).then(() => null), {
      optimisticData: (current: Session[] = []) =>
        current.filter((existing) => existing.id !== session.id),
      rollbackOnError: true,
      revalidate: true,
    });

    onDeleted();
  };
}
