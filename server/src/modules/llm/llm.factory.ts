import { config } from "../../config/environment";
import { GeminiLLMProvider } from "./gemini.provider";
import { HttpLLMProvider } from "./llm.provider";
import type { LLMProvider } from "./llm.types";

let provider: LLMProvider | undefined;

export function validateLLMConfigurations(): {
  geminiConfigured: boolean;
  geminiModel: string;
  groqConfigured: boolean;
  groqModel: string;
  defaultProvider: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const geminiConfigured = Boolean(config.gemini.apiKey);
  const groqConfigured = Boolean(config.llm.apiKey);

  if (!geminiConfigured && !groqConfigured) {
    warnings.push("Neither GEMINI_API_KEY nor GROQ_API_KEY is configured. LLM turns will fail.");
  }

  const deprecatedGeminiModels = ["gemini-1.0-pro", "gemini-pro", "gemini-1.5-pro-latest"];
  if (config.gemini.model && deprecatedGeminiModels.includes(config.gemini.model)) {
    warnings.push(`Configured GEMINI_MODEL '${config.gemini.model}' is deprecated or may not support structured tool calling.`);
  }

  return {
    geminiConfigured,
    geminiModel: config.gemini.model || "none",
    groqConfigured,
    groqModel: config.llm.model || "none",
    defaultProvider: config.llm.provider || "none",
    warnings,
  };
}

export function getLLMProvider(): LLMProvider {
  if (!provider) {
    if (config.llm.provider === "gemini") {
      provider = new GeminiLLMProvider();
    } else {
      provider = new HttpLLMProvider();
    }
  }
  return provider;
}

export function setLLMProviderForTests(next: LLMProvider): void {
  provider = next;
}
