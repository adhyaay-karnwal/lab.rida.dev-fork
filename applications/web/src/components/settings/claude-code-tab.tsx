"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/button";
import { FormInput } from "@/components/form-input";
import {
  type ClaudeAuthStatusResponse,
  getClaudeAuthEventsUrl,
  getClaudeAuthStatus,
  logoutClaudeAuth,
  startClaudeAuth,
  submitClaudeAuthCode,
} from "@/lib/api";

function SettingsPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex max-w-sm flex-col gap-2">{children}</div>
    </div>
  );
}

function statusLabel(status: ClaudeAuthStatusResponse): string {
  if (status.auth?.loggedIn) {
    return "Connected";
  }
  if (
    status.flow.state === "starting" ||
    status.flow.state === "url_ready" ||
    status.flow.state === "awaiting_code"
  ) {
    return "Awaiting browser auth";
  }
  if (status.flow.state === "error") {
    return "Auth failed";
  }
  return "Not connected";
}

interface ClaudeAuthStatusEvent {
  id: number;
  type: "status";
  status: ClaudeAuthStatusResponse;
}

export function ClaudeCodeTab() {
  const [pendingAction, setPendingAction] = useState<"start" | "logout" | null>(
    null
  );
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    "claude-auth-status",
    getClaudeAuthStatus
  );

  useEffect(() => {
    const source = new EventSource(getClaudeAuthEventsUrl(), {
      withCredentials: true,
    });

    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as ClaudeAuthStatusEvent;
        if (!(parsed?.type === "status" && parsed.status)) {
          return;
        }
        mutate(parsed.status, { revalidate: false });
      } catch {
        // Ignore malformed events.
      }
    };

    return () => source.close();
  }, [mutate]);

  const stateLabel = useMemo(
    () => (data ? statusLabel(data) : "Loading"),
    [data]
  );
  const isConnected = Boolean(data?.auth?.loggedIn);
  const loginUrl = data?.flow.loginUrl ?? null;

  const handleConnect = async () => {
    setPendingAction("start");
    setErrorMessage(null);
    try {
      const status = await startClaudeAuth();
      await mutate(status, { revalidate: false });

      if (status.flow.loginUrl) {
        window.open(status.flow.loginUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start Claude login"
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleDisconnect = async () => {
    setPendingAction("logout");
    setErrorMessage(null);
    try {
      const status = await logoutClaudeAuth();
      await mutate(status, { revalidate: false });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to disconnect Claude"
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmitCode = async () => {
    if (!authCode.trim()) {
      setErrorMessage("Please paste the Claude authentication code");
      return;
    }

    setIsSubmittingCode(true);
    setErrorMessage(null);
    try {
      const status = await submitClaudeAuthCode(authCode.trim());
      setAuthCode("");
      await mutate(status, { revalidate: false });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit auth code"
      );
    } finally {
      setIsSubmittingCode(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsPanel>
        <span className="text-text-muted text-xs">Loading...</span>
      </SettingsPanel>
    );
  }

  if (error || !data) {
    return (
      <SettingsPanel>
        <FormInput.Error>
          Failed to load Claude Code auth status
        </FormInput.Error>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel>
      <div className="flex items-center justify-between">
        <span className="font-medium text-text text-xs">Claude Code</span>
        <span className="text-text-muted text-xs">{stateLabel}</span>
      </div>

      {isConnected && (
        <div className="text-text-secondary text-xs">
          Connected as {data.auth?.email ?? "Claude account"}
        </div>
      )}

      {!isConnected && (
        <Button disabled={pendingAction === "start"} onClick={handleConnect}>
          <ExternalLink size={12} />
          {pendingAction === "start"
            ? "Starting login..."
            : "Login with Claude Pro/Max"}
        </Button>
      )}

      {loginUrl &&
        (data.flow.state === "starting" ||
          data.flow.state === "url_ready" ||
          data.flow.state === "awaiting_code") && (
          <div className="flex flex-col gap-2">
            <a
              className="text-text-secondary text-xs underline underline-offset-2"
              href={loginUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open login link again
            </a>
            <FormInput.Text
              onChange={(event) => setAuthCode(event.target.value)}
              placeholder="Paste Claude authentication code"
              value={authCode}
            />
            <Button disabled={isSubmittingCode} onClick={handleSubmitCode}>
              {isSubmittingCode ? "Submitting code..." : "Submit auth code"}
            </Button>
          </div>
        )}

      {isConnected && (
        <Button
          disabled={pendingAction === "logout"}
          onClick={handleDisconnect}
          variant="ghost"
        >
          {pendingAction === "logout" ? "Disconnecting..." : "Disconnect"}
        </Button>
      )}

      {data.flow.error && <FormInput.Error>{data.flow.error}</FormInput.Error>}
      {errorMessage && <FormInput.Error>{errorMessage}</FormInput.Error>}
    </SettingsPanel>
  );
}
