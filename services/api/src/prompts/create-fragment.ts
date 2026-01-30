import type { PromptFragment, PromptContext } from "./types";

interface CreateFragmentOptions {
  id: string;
  name: string;
  /** Lower values appear first in the composed prompt. */
  priority: number;
  render: (context: PromptContext) => string | null;
  shouldInclude?: (context: PromptContext) => boolean;
}

export const createFragment = (options: CreateFragmentOptions): PromptFragment => ({
  id: options.id,
  name: options.name,
  priority: options.priority,
  render: options.render,
  shouldInclude: options.shouldInclude,
});
