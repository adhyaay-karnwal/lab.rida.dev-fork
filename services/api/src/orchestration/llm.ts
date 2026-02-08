import { generateText } from "ai";
import { readModelConfig, createLanguageModel, type LlmModelConfig } from "../shared/llm-factory";

type OrchestratorModelConfig = LlmModelConfig;

export async function complete(prompt: string): Promise<string> {
  const config = readModelConfig("ORCHESTRATOR_MODEL");
  const model = createLanguageModel(config);

  const { text } = await generateText({ model, prompt });
  return text;
}
