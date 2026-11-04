import { config } from "../../config/environment";
import { GeminiLLMProvider } from "./gemini.provider";
import { HttpLLMProvider } from "./llm.provider";
import type { LLMProvider } from "./llm.types";

let provider: LLMProvider | undefined;

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
