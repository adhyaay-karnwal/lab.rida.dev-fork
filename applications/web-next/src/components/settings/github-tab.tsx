"use client";

import { createContext, use, useState, type ReactNode } from "react";
import useSWR from "swr";
import { FormInput } from "@/components/form-input";
import { getGitHubSettings, saveGitHubSettings } from "@/lib/api";

type Edits = {
  pat?: string;
  username?: string;
  authorName?: string;
  authorEmail?: string;
  attributeAgent?: boolean;
};

interface GitHubSettingsState {
  pat: string;
  username: string;
  authorName: string;
  authorEmail: string;
  attributeAgent: boolean;
  hasPatConfigured: boolean;
  saving: boolean;
  error: string | null;
  success: boolean;
}

interface GitHubSettingsActions {
  updateField: <K extends keyof Edits>(field: K) => (value: Edits[K]) => void;
  save: () => Promise<void>;
}

interface GitHubSettingsContextValue {
  state: GitHubSettingsState;
  actions: GitHubSettingsActions;
}

const GitHubSettingsContext = createContext<GitHubSettingsContextValue | null>(null);

function useGitHubSettingsContext() {
  const context = use(GitHubSettingsContext);
  if (!context)
    throw new Error("GitHubSettings components must be used within GitHubSettings.Provider");
  return context;
}

function GitHubSettingsProvider({ children }: { children: ReactNode }) {
  const { data: settings, mutate } = useSWR("github-settings", getGitHubSettings);

  const [edits, setEdits] = useState<Edits>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const state: GitHubSettingsState = {
    pat: edits.pat ?? "",
    username: edits.username ?? settings?.username ?? "",
    authorName: edits.authorName ?? settings?.authorName ?? "",
    authorEmail: edits.authorEmail ?? settings?.authorEmail ?? "",
    attributeAgent: edits.attributeAgent ?? settings?.attributeAgent ?? true,
    hasPatConfigured: settings?.hasPatConfigured ?? false,
    saving,
    error,
    success,
  };

  const actions: GitHubSettingsActions = {
    updateField: (field) => (value) => {
      setEdits((current) => ({ ...current, [field]: value }));
    },
    save: async () => {
      setSaving(true);
      setError(null);
      setSuccess(false);

      try {
        await saveGitHubSettings({
          pat: state.pat || undefined,
          username: state.username || undefined,
          authorName: state.authorName || undefined,
          authorEmail: state.authorEmail || undefined,
          attributeAgent: state.attributeAgent,
        });
        setEdits({});
        mutate();
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      } finally {
        setSaving(false);
      }
    },
  };

  return <GitHubSettingsContext value={{ state, actions }}>{children}</GitHubSettingsContext>;
}

function GitHubSettingsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex flex-col gap-1 max-w-sm">{children}</div>
    </div>
  );
}

function GitHubSettingsField({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function GitHubSettingsPat() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <GitHubSettingsField>
      <FormInput.Label>Personal Access Token</FormInput.Label>
      <FormInput.Password
        value={state.pat}
        onChange={(event) => actions.updateField("pat")(event.target.value)}
        placeholder={
          state.hasPatConfigured ? "Token configured (enter new to replace)" : "ghp_xxxxxxxxxxxx"
        }
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsUsername() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <GitHubSettingsField>
      <FormInput.Label>Username</FormInput.Label>
      <FormInput.Text
        value={state.username}
        onChange={(event) => actions.updateField("username")(event.target.value)}
        placeholder="your-github-username"
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsAuthorName() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <GitHubSettingsField>
      <FormInput.Label>Commit Author Name</FormInput.Label>
      <FormInput.Text
        value={state.authorName}
        onChange={(event) => actions.updateField("authorName")(event.target.value)}
        placeholder="Your Name"
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsAuthorEmail() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <GitHubSettingsField>
      <FormInput.Label>Commit Author Email</FormInput.Label>
      <FormInput.Text
        type="email"
        value={state.authorEmail}
        onChange={(event) => actions.updateField("authorEmail")(event.target.value)}
        placeholder="my-agent@example.com"
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsAttributeAgent() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <FormInput.Checkbox
      checked={state.attributeAgent}
      onChange={actions.updateField("attributeAgent")}
      label="Attribute agent to commits"
    />
  );
}

function GitHubSettingsMessages() {
  const { state } = useGitHubSettingsContext();
  return (
    <>
      {state.error && <FormInput.Error>{state.error}</FormInput.Error>}
      {state.success && <FormInput.Success>Settings saved</FormInput.Success>}
    </>
  );
}

function GitHubSettingsSaveButton() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <FormInput.Submit onClick={actions.save} loading={state.saving} loadingText="Saving...">
      Save
    </FormInput.Submit>
  );
}

const GitHubSettings = {
  Provider: GitHubSettingsProvider,
  Panel: GitHubSettingsPanel,
  Field: GitHubSettingsField,
  Pat: GitHubSettingsPat,
  Username: GitHubSettingsUsername,
  AuthorName: GitHubSettingsAuthorName,
  AuthorEmail: GitHubSettingsAuthorEmail,
  AttributeAgent: GitHubSettingsAttributeAgent,
  Messages: GitHubSettingsMessages,
  SaveButton: GitHubSettingsSaveButton,
};

export function GitHubTab() {
  const { isLoading, error } = useSWR("github-settings", getGitHubSettings);

  if (isLoading) {
    return (
      <GitHubSettings.Panel>
        <span className="text-xs text-text-muted">Loading...</span>
      </GitHubSettings.Panel>
    );
  }

  if (error) {
    return (
      <GitHubSettings.Panel>
        <FormInput.Error>Failed to load settings</FormInput.Error>
      </GitHubSettings.Panel>
    );
  }

  return (
    <GitHubSettings.Provider>
      <GitHubSettings.Panel>
        <GitHubSettings.Pat />
        <GitHubSettings.Username />
        <GitHubSettings.AuthorName />
        <GitHubSettings.AuthorEmail />
        <GitHubSettings.AttributeAgent />
        <GitHubSettings.Messages />
        <GitHubSettings.SaveButton />
      </GitHubSettings.Panel>
    </GitHubSettings.Provider>
  );
}
