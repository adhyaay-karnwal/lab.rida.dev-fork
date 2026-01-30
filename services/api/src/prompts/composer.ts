import type { PromptFragment, PromptContext, PromptService } from "./types";

export interface PromptComposerConfig {
  fragments: PromptFragment[];
  separator?: string;
}

export class PromptComposer implements PromptService {
  private readonly fragments: PromptFragment[];
  private readonly separator: string;

  constructor(config: PromptComposerConfig) {
    this.fragments = [...config.fragments].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this.separator = config.separator ?? "\n\n";
  }

  compose(context: PromptContext): { text: string; includedFragments: string[] } {
    const includedFragments: string[] = [];
    const renderedParts: string[] = [];

    for (const fragment of this.fragments) {
      const shouldInclude = fragment.shouldInclude?.(context) ?? true;

      if (!shouldInclude) continue;

      const rendered = fragment.render(context);

      if (rendered === null || rendered.length === 0) continue;

      includedFragments.push(fragment.id);
      renderedParts.push(rendered);
    }

    return {
      text: renderedParts.join(this.separator),
      includedFragments,
    };
  }
}
