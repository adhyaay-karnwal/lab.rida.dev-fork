import type { PromptFragment, PromptService } from "./types";
import { PromptComposer } from "./composer";
import { agentBrowserFragment } from "./fragments/agent-browser";
import { containerServicesFragment } from "./fragments/container-services";
import { projectPromptFragment } from "./fragments/project-prompt";

export class PromptBuilder {
  private readonly fragments: PromptFragment[] = [];
  private separator: string = "\n\n";

  private constructor(fragments: PromptFragment[] = []) {
    this.fragments = [...fragments];
  }

  static empty(): PromptBuilder {
    return new PromptBuilder();
  }

  static defaults(): PromptBuilder {
    return new PromptBuilder([
      agentBrowserFragment,
      containerServicesFragment,
      projectPromptFragment,
    ]);
  }

  withFragment(fragment: PromptFragment): PromptBuilder {
    this.fragments.push(fragment);
    return this;
  }

  withAgentBrowser(): PromptBuilder {
    return this.withFragment(agentBrowserFragment);
  }

  withContainerServices(): PromptBuilder {
    return this.withFragment(containerServicesFragment);
  }

  withProjectPrompt(): PromptBuilder {
    return this.withFragment(projectPromptFragment);
  }

  withSeparator(separator: string): PromptBuilder {
    this.separator = separator;
    return this;
  }

  build(): PromptService {
    return new PromptComposer({
      fragments: this.fragments,
      separator: this.separator,
    });
  }
}

export function createDefaultPromptService(): PromptService {
  return PromptBuilder.defaults().build();
}
