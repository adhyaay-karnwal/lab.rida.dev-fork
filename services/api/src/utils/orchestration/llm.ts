import { generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export interface OrchestratorModelConfig {
  provider: string;
  model: string;
  apiKey: string;
}

function getModelConfig(): OrchestratorModelConfig {
  const provider = process.env.ORCHESTRATOR_MODEL_PROVIDER;
  const model = process.env.ORCHESTRATOR_MODEL_NAME;
  const apiKey = process.env.ORCHESTRATOR_MODEL_API_KEY;

  if (!provider || !model || !apiKey) {
    throw new Error(
      "Missing orchestrator model config. Set ORCHESTRATOR_MODEL_PROVIDER, ORCHESTRATOR_MODEL_NAME, and ORCHESTRATOR_MODEL_API_KEY",
    );
  }

  return { provider, model, apiKey };
}

function createModel(config: OrchestratorModelConfig): LanguageModel {
  switch (config.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    default:
      throw new Error(`Unsupported orchestrator provider: ${config.provider}`);
  }
}

export async function complete(prompt: string): Promise<string> {
  const config = getModelConfig();
  const model = createModel(config);

  const { text } = await generateText({ model, prompt });
  return text;
}
