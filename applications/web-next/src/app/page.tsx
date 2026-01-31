"use client";

import { useState } from "react";
import { Nav } from "@/components/nav";
import { Orchestration, useOrchestration } from "@/components/orchestration";
import { ProjectNavigator } from "@/components/project-navigator-list";
import { TextAreaGroup } from "@/components/textarea-group";
import { SplitPane, useSplitPane } from "@/components/split-pane";
import { navItems, mockProjects } from "@/placeholder/data";
import { modelGroups, defaultModel } from "@/placeholder/models";

function ProjectNavigatorView({ children }: { children?: React.ReactNode }) {
  const { selected, select } = useSplitPane();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-px bg-border py-pb">
        {mockProjects.map((project) => (
          <ProjectNavigator.List key={project.id}>
            <ProjectNavigator.Header
              name={project.name}
              count={project.sessions.length}
              onAdd={() => console.log("Add session to", project.name)}
            />
            {project.sessions.map((session) => (
              <ProjectNavigator.Item
                key={session.id}
                status={session.status}
                hash={session.id}
                title={session.title}
                lastMessage={session.lastMessage}
                selected={selected === session.id}
                onClick={() => select(session.id)}
              />
            ))}
          </ProjectNavigator.List>
        ))}
      </div>
      {children}
    </div>
  );
}

function ConversationPreview({ sessionId }: { sessionId: string | null }) {
  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        Select a session to preview
      </div>
    );
  }

  const session = mockProjects
    .flatMap((project) => project.sessions)
    .find((session) => session.id === sessionId);

  if (!session) return null;

  return (
    <div className="p-4">
      <h2 className="text-lg font-medium">{session.title}</h2>
      <p className="text-text-muted mt-1">{session.lastMessage}</p>
    </div>
  );
}

function PromptArea() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultModel);
  const orchestration = useOrchestration();

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    const id = orchestration.add({ status: "thinking" });
    setPrompt("");

    // Simulate orchestration flow
    await new Promise((resolve) => setTimeout(resolve, 1500));
    orchestration.update(id, { status: "delegating" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.update(id, { status: "starting", projectName: "opencode-web" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.remove(id);
  };

  return (
    <div className="sticky bottom-0 px-4 pb-4 pt-12 bg-linear-to-t from-bg to-transparent pointer-events-none">
      <Orchestration.List />
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
            <TextAreaGroup.ModelSelector value={model} groups={modelGroups} onChange={setModel} />
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

export default function Page() {
  return (
    <Orchestration.Provider>
      <div className="flex flex-col h-screen">
        <Nav items={navItems} activeHref="/projects" />
        <SplitPane.Root>
          <SplitPane.Primary>
            <ProjectNavigatorView>
              <PromptArea />
            </ProjectNavigatorView>
          </SplitPane.Primary>
          <SplitPane.Secondary>
            {(selected) => <ConversationPreview sessionId={selected} />}
          </SplitPane.Secondary>
        </SplitPane.Root>
      </div>
    </Orchestration.Provider>
  );
}
