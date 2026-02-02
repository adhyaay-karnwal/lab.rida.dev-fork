"use client";

import { useState } from "react";
import { CenteredLayout } from "@/components/centered-layout";
import { Nav } from "@/components/nav";
import { TextAreaGroup } from "@/components/textarea-group";
import { Orchestration } from "@/components/orchestration";
import { SessionList } from "@/components/session-list";
import { navItems } from "@/placeholder/data";
import { useModels } from "@/lib/hooks";
import { useOrchestrate } from "@/lib/use-orchestrate";
import { defaultModel } from "@/placeholder/models";

function mapToIndicatorStatus(status: string): "thinking" | "delegating" | "starting" | null {
  if (status === "pending" || status === "thinking") return "thinking";
  if (status === "delegating") return "delegating";
  if (status === "starting") return "starting";
  return null;
}

function OrchestratorPrompt() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultModel);
  const { data: modelGroups } = useModels();
  const { submit, state } = useOrchestrate();

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    const content = prompt.trim();
    setPrompt("");
    await submit(content, { modelId: model });
  };

  const indicatorStatus = mapToIndicatorStatus(state.status);

  return (
    <div className="w-full">
      {indicatorStatus && (
        <div className="flex flex-col gap-2 mb-2">
          <Orchestration.Indicator
            status={indicatorStatus}
            projectName={state.projectName ?? undefined}
          />
        </div>
      )}
      <TextAreaGroup.Provider
        state={{ value: prompt }}
        actions={{
          onChange: setPrompt,
          onSubmit: handleSubmit,
        }}
      >
        <TextAreaGroup.Frame>
          <TextAreaGroup.Input />
          <TextAreaGroup.Toolbar>
            {modelGroups && (
              <TextAreaGroup.ModelSelector value={model} groups={modelGroups} onChange={setModel} />
            )}
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

export default function Page() {
  return (
    <div className="flex flex-col h-screen">
      <Nav items={navItems} />
      <CenteredLayout.Root>
        <CenteredLayout.Hero>
          <OrchestratorPrompt />
        </CenteredLayout.Hero>
        <CenteredLayout.Content>
          <SessionList.View />
        </CenteredLayout.Content>
      </CenteredLayout.Root>
    </div>
  );
}
