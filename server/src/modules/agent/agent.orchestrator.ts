import { HttpError } from "../../common/errors";
import { LLMError } from "../llm/llm.errors";
import { parseAgentOutput } from "./agent.validator";
import { systemPrompt } from "./agent.prompt";
import { findTool, toolDefinitions } from "./agent.tools";
import type { AgentContext } from "../context/context.types";
import type { LLMProvider, LLMMessage } from "../llm/llm.types";
import type { AgentLLMOutput, AgentTurnResult } from "./agent.types";

const MAX_ITERATIONS = 3;
const MAX_TOOL_CALLS = 4;

function computeAdaptiveOutputBudget(context: AgentContext, iteration: number): number {
  const content = context.request.currentUserMessage.content.trim().toLowerCase();

  // Complex tasks: active form tasks, intelligent mapping, or multi-step tool iterations
  if (context.formTask?.id || iteration > 0) {
    return 1000;
  }

  // Detailed explanation or multi-step guide requests
  const isDetailedRequest =
    content.length > 80 ||
    /explain|step by step|how to|guide|details|list|विस्तार|कसे|माहिती|प्रक्रिया/.test(content);
  if (isDetailedRequest) {
    return 1200;
  }

  // Simple questions, greetings, voice acknowledgments
  if (content.length < 35 && !/explain|step by step|how to|guide|details|list|विस्तार/.test(content)) {
    return 400;
  }

  // Standard conversations, queries, memories, corrections
  if (content.length > 25 || content.includes("?") || content.includes("क्या") || content.includes("का")) {
    return 650;
  }

  return 400;
}

function providerError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof LLMError && error.code === "INVALID_RESPONSE") {
    throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant returned an invalid response");
  }
  if (error instanceof LLMError && error.code === "RATE_LIMITED") {
    throw new HttpError(429, "AGENT_RATE_LIMITED", "The assistant is temporarily rate limited; please try again");
  }
  throw new HttpError(503, "AGENT_UNAVAILABLE", "The assistant is temporarily unavailable; no changes were made");
}

export async function orchestrate(
  userId: string,
  context: AgentContext,
  provider: LLMProvider,
): Promise<AgentTurnResult> {
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt(context, toolDefinitions) },
    { role: "user", content: context.request.currentUserMessage.content },
  ];
  const toolResults: AgentTurnResult["toolResults"] = [];
  let output: AgentLLMOutput | undefined;
  let toolsExecuted = false;
  let recoveryAttempts = 0;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let response;
    const canUseTools = !toolsExecuted && (iteration === 0 || recoveryAttempts > 0);
    const maxOutputTokens = computeAdaptiveOutputBudget(context, iteration);
    try {
      response = await provider.generateResponse({
        messages,
        tools: toolsExecuted || canUseTools ? toolDefinitions : [],
        toolChoice: canUseTools ? "auto" : "none",
        maxOutputTokens,
      });
    } catch (error) {
      if (iteration === 0 && error instanceof LLMError && error.code === "PROVIDER_UNAVAILABLE") {
        try {
          response = await provider.generateResponse({ messages, tools: [], toolChoice: "none" });
        } catch (retryError) {
          providerError(retryError);
        }
      } else {
        providerError(error);
      }
    }
    if (response.toolCalls.length === 0) {
      try {
        output = parseAgentOutput(response.content ?? "");
      } catch {
        if (recoveryAttempts < 1) {
          recoveryAttempts += 1;
          messages.push({
            role: "assistant",
            content: response.content ?? "",
          });
          messages.push({
            role: "user",
            content: [
              "Your previous response did not match the required decision schema.",
              "Return only a JSON object with exactly these required fields:",
              '{"intent":{"primary":"GREETING","secondary":[],"confidence":0.0},"language":{"detected":"en","responseLanguage":"en"},"decision":{"type":"respond"},"toolCalls":[],"responseDraft":"..."}',
              "Use the most appropriate intent and language values for the user message. Set toolCalls to an empty array because tools are not executed during recovery. Do not add a response field.",
            ].join(" "),
          });
          continue;
        }
        throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant returned an invalid response");
      }
      const responseText = output.clarification?.required
        ? output.clarification.question
        : output.responseDraft;
      if (!responseText) throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant returned an unusable response");
      return { response: responseText, intent: output.intent, decision: output.decision, context, toolResults };
    }
    if (toolsExecuted) {
      throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant requested another operation after tool execution");
    }
    if (response.toolCalls.length > MAX_TOOL_CALLS) throw new HttpError(400, "TOOL_LIMIT_EXCEEDED", "Too many operations were requested");
    messages.push({
      role: "assistant",
      content: response.content ?? null,
      toolCalls: response.toolCalls,
    });
    for (const call of response.toolCalls) {
      if (toolResults.some((result) => result.toolCallId === call.id)) continue;
      const tool = findTool(call.name);
      if (!tool) throw new HttpError(400, "UNKNOWN_TOOL", "The requested operation is not available");
      try {
        let argumentsValue: unknown;
        try {
          argumentsValue = JSON.parse(call.arguments);
        } catch {
          throw new HttpError(400, "INVALID_TOOL_ARGUMENTS", "The requested operation had invalid arguments");
        }
        const data = await tool.execute(userId, context, argumentsValue);
        toolResults.push({ toolCallId: call.id, name: call.name, success: true, data });
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ success: true, data }) });
      } catch {
        toolResults.push({ toolCallId: call.id, name: call.name, success: false });
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ success: false }) });
      }
    }
    toolsExecuted = true;
  }
  throw new HttpError(409, "AGENT_ITERATION_LIMIT", "The assistant could not complete this request safely");
}
