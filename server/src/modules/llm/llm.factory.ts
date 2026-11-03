import { HttpLLMProvider } from "./llm.provider";
import type { LLMProvider } from "./llm.types";

let provider: LLMProvider | undefined;

export function getLLMProvider(): LLMProvider {
  provider ??= new HttpLLMProvider();
  return provider;
}

export function setLLMProviderForTests(next: LLMProvider): void {
  provider = next;
}
