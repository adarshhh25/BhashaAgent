import { HttpError } from "../../common/errors";
import { LLMError } from "../llm/llm.errors";
import { parseAgentOutput, sanitizeResponseText } from "./agent.validator";
import { systemPrompt } from "./agent.prompt";
import { findTool, toolDefinitions } from "./agent.tools";
import { detectConversationLanguage, isDevanagari } from "./language-detector";
import type { AgentContext } from "../context/context.types";
import type { LLMProvider, LLMMessage } from "../llm/llm.types";
import type { AgentLLMOutput, AgentTurnResult } from "./agent.types";
import { logLLMEvent, logLLMTurnSummary, type LLMValidationStatus } from "../llm/llm-logger";

const MAX_ITERATIONS = 3;
const MAX_TOOL_CALLS = 4;

function computeAdaptiveOutputBudget(_context: AgentContext, _iteration: number): number {
  return 2048;
}

export function sanitizeFalseExecutionClaims(
  rawText: string,
  context: AgentContext,
  detectedLang: string,
  toolResults: AgentTurnResult["toolResults"],
): string {
  let text = rawText.trim();
  if (!context.formTask?.id) return text;

  const userContent = (context.request?.currentUserMessage?.content || "").toLowerCase().trim();
  const fields = context.formTask.detectedFields || [];

  // Check 1: Fabricated customer name protection (e.g. "Adarsh Jha" / "आदर्श झा")
  const containsFabricatedName =
    /\b(adarsh jha|adarsh)\b/i.test(text) || /आदर्श झा|आदर्श/i.test(text);
  const userMentionedName =
    /\b(adarsh jha|adarsh)\b/i.test(userContent) || /आदर्श झा|आदर्श/i.test(userContent);
  const userAuthorizedProfile =
    /\b(profile|saved|मेरी प्रोफाइल|माझी प्रोफाईल|माझे तपशील|saved details|use saved|fill from profile)\b/i.test(userContent);

  if (containsFabricatedName && !userMentionedName && !userAuthorizedProfile) {
    console.warn(`[AgentOrchestrator] Intercepted fabricated name in response: "${text}"`);
    if (detectedLang === "hi") {
      return "मैं इस फ़ॉर्म को पूरा करने में आपकी मदद कर सकता हूँ। शुरुआत करने के लिए, कृपया कस्टमर का नाम बताइए?";
    } else if (detectedLang === "mr") {
      return "मी हा फॉर्म पूर्ण करण्यासाठी तुम्हाला मदत करू शकतो. सुरू करण्यासाठी, कृपया ग्राहकाचे नाव सांगा?";
    } else if (detectedLang === "hinglish") {
      return "Main is form ko fill karne mein aapki help kar sakta hoon. Pehle customer name bata dijiye?";
    } else {
      return "I can help you complete this form! To start, what name should I use for the customer?";
    }
  }

  // Check 2: False execution claim on webpage DOM
  const claimsFilledHindi = /मैंने (?:.+?) भर दिया है|डाल दिया है|सेलेक्ट कर दिया है/i.test(text);
  const claimsFilledEnglish = /I have (?:filled|entered|selected)|I've (?:filled|entered|selected)/i.test(text);
  const claimsFilledMarathi = /मी (?:.+?) भरले आहे|भरून दिले आहे/i.test(text);
  const claimsFilledHinglish = /Maine (?:.+?) fill kar diya hai/i.test(text);

  const anyVerified = fields.some((f) => f.isVerified === true);

  if (!anyVerified && (claimsFilledHindi || claimsFilledEnglish || claimsFilledMarathi || claimsFilledHinglish)) {
    // If a tool was executed in this turn, the detail was COLLECTED/NOTED
    if (toolResults.length > 0 && toolResults.some((tr) => tr.success)) {
      text = text
        .replace(/मैंने (.+?) भर दिया है।?/g, "मैंने $1 नोट कर लिया है।")
        .replace(/मैंने (.+?) भर दिया।?/g, "मैंने $1 नोट कर लिया है।")
        .replace(/I have filled ([^.]+)\./gi, "I've noted $1.")
        .replace(/I've filled ([^.]+)\./gi, "I've noted $1.")
        .replace(/मी (.+?) भरले आहे।?/g, "मी $1 नोंदवून घेतले आहे.")
        .replace(/Maine (.+?) fill kar diya hai\.?/gi, "Maine $1 note kar liya hai.");
    } else {
      // No tool was executed, and nothing was verified. If it still claims to have filled, sanitize:
      console.warn(`[AgentOrchestrator] Intercepted false execution claim without tool execution: "${text}"`);
      if (detectedLang === "hi") {
        return "मैंने फ़ॉर्म के विवरण देख लिए हैं। कृपया बताइए कि आप कौन सा विवरण भरना चाहते हैं?";
      } else if (detectedLang === "mr") {
        return "मी फॉर्मचे तपशील पाहिले आहेत. कृपया सांगा की तुम्हाला कोणता तपशील भरायचा आहे?";
      } else if (detectedLang === "hinglish") {
        return "Maine form details dekh liye hain. Aap kaunsa detail pehle bharna chahte hain?";
      } else {
        return "I can see the form. Which detail would you like me to note first?";
      }
    }
  }

  return text;
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
  const requestId = context.request?.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const conversationId = context.conversation?.id || "unknown";
  const turnStartTime = Date.now();

  let effectiveModel = "unknown";
  let effectiveProvider = "gemini";
  let totalAttemptCount = 0;
  let fallbackUsed = false;
  const fallbackReasons: string[] = [];
  const modelsAttempted: string[] = [];
  const modelsUsed: string[] = [];
  const roundModels: Array<{ round: number; model: string; outcome: string; toolCallCount?: number }> = [];
  let providerSuccess = false;
  let parseSuccess = false;
  let structuredResponseValid = false;
  let validationStatus: LLMValidationStatus = "not_applicable";
  let totalToolCallCount = 0;
  let finalResponseSuccess = false;
  let failureStage: string | undefined;
  let failureReason: string | undefined;

  try {
    const detectedTurnLang = detectConversationLanguage(
      context.request.currentUserMessage.content || "",
      context.request.currentUserMessage.language || context.user?.preferredLanguage || "en",
    );

    let userTurnContent = context.request.currentUserMessage.content;
    if (detectedTurnLang === "hi") {
      userTurnContent = `[SYSTEM MANDATE: User spoken language is HINDI. Output responseDraft in HINDI Devanagari script only. Never use English.]\n${userTurnContent}`;
    } else if (detectedTurnLang === "mr") {
      userTurnContent = `[SYSTEM MANDATE: User spoken language is MARATHI. Output responseDraft in MARATHI Devanagari script only. Never use English or Hindi.]\n${userTurnContent}`;
    } else if (detectedTurnLang === "hinglish") {
      userTurnContent = `[SYSTEM MANDATE: User spoken language is HINGLISH. Output responseDraft in HINGLISH (Latin script) only. Never use pure formal English or Devanagari script.]\n${userTurnContent}`;
    } else {
      userTurnContent = `[SYSTEM MANDATE: User spoken language is ENGLISH. Output responseDraft in natural ENGLISH only. Do not respond in Hindi, Marathi, or Hinglish.]\n${userTurnContent}`;
    }

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt(context, toolDefinitions) },
      { role: "user", content: userTurnContent },
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
          requestId,
          conversationId,
        });
      } catch (error) {
        if (iteration === 0 && error instanceof LLMError && error.code === "PROVIDER_UNAVAILABLE") {
          try {
            response = await provider.generateResponse({
              messages,
              tools: [],
              toolChoice: "none",
              requestId,
              conversationId,
            });
          } catch (retryError) {
            failureStage = "provider_call";
            failureReason = "PROVIDER_UNAVAILABLE";
            providerError(retryError);
          }
        } else {
          failureStage = "provider_call";
          failureReason = error instanceof LLMError ? error.code : "PROVIDER_ERROR";
          providerError(error);
        }
      }

      providerSuccess = true;
      if (response.model && !modelsAttempted.includes(response.model)) {
        modelsAttempted.push(response.model);
      }
      if (response.provider) effectiveProvider = response.provider;
      totalAttemptCount += (response.attemptCount || 1);
      if (response.fallbackUsed) fallbackUsed = true;
      if (response.fallbackReasons && response.fallbackReasons.length > 0) {
        fallbackReasons.push(...response.fallbackReasons);
      }

      if (response.toolCalls.length === 0) {
        try {
          const parsedOutput = parseAgentOutput(response.content ?? "", detectedTurnLang);
          output = parsedOutput;
          parseSuccess = parsedOutput.__telemetry?.parseSuccess ?? true;
          structuredResponseValid = parsedOutput.__telemetry?.structuredResponseValid ?? true;
          validationStatus = parsedOutput.__telemetry?.validationStatus ?? "valid";

          if (response.model) {
            effectiveModel = response.model;
            if (!modelsUsed.includes(response.model)) modelsUsed.push(response.model);
          }
          roundModels.push({
            round: iteration + 1,
            model: response.model || effectiveModel,
            outcome: "final_response",
            toolCallCount: 0,
          });

          logLLMEvent("Structured response validated", {
            requestId,
            model: effectiveModel,
            structuredResponseValid,
            validationStatus,
          });
        } catch (parseErr: any) {
          parseSuccess = false;
          structuredResponseValid = false;
          validationStatus = "invalid";

          logLLMEvent("Structured response validated", {
            requestId,
            model: effectiveModel,
            structuredResponseValid: false,
            validationStatus: "invalid",
            outcome: "parsing_failure",
          });

          if (recoveryAttempts < 1) {
            recoveryAttempts += 1;
            fallbackUsed = true;
            fallbackReasons.push("STRUCTURED_VALIDATION_FAILED");
            messages.push({
              role: "assistant",
              content: response.content ?? "",
            });
            messages.push({
              role: "user",
              content: [
                "Your previous response did not match the required decision schema.",
                "Return only a JSON object with exactly these required fields:",
                `{"intent":{"primary":"GENERAL_QUESTION","secondary":[],"confidence":0.9},"language":{"detected":"${detectedTurnLang}","responseLanguage":"${detectedTurnLang}"},"decision":{"type":"respond"},"toolCalls":[],"responseDraft":"..."}`,
                `Write responseDraft in ${detectedTurnLang.toUpperCase()}. Set toolCalls to an empty array because tools are not executed during recovery. Do not add a response field.`,
              ].join(" "),
            });
            continue;
          }
          failureStage = "structured_validation";
          failureReason = "INVALID_AGENT_RESPONSE";
          throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant returned an invalid response");
        }

        if (!output) {
          failureStage = "structured_validation";
          failureReason = "INVALID_AGENT_RESPONSE";
          throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant returned an invalid response");
        }

        // Enforce detected turn language across all turns
        output.language.detected = detectedTurnLang;
        output.language.responseLanguage = detectedTurnLang;

        let responseText = output.clarification?.required
          ? output.clarification.question
          : output.responseDraft;
        if (!responseText) {
          failureStage = "structured_validation";
          failureReason = "EMPTY_RESPONSE_DRAFT";
          throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant returned an unusable response");
        }

        // Intercept false claims & fabricated values against actual context state
        responseText = sanitizeFalseExecutionClaims(responseText, context, detectedTurnLang, toolResults);
        if (output.responseDraft) output.responseDraft = responseText;

        // Sanitize against leaked schema or raw JSON
        responseText = sanitizeResponseText(responseText, detectedTurnLang);

        // Verify Devanagari script for Hindi and Marathi
        if ((detectedTurnLang === "hi" || detectedTurnLang === "mr") && !isDevanagari(responseText)) {
          console.warn(`[AgentOrchestrator] Model emitted English responseDraft for ${detectedTurnLang} turn. Translating to ${detectedTurnLang}...`);
          try {
            const transPrompt = detectedTurnLang === "hi"
              ? `You are an expert multilingual assistant. Translate this response into natural conversational Hindi in standard Devanagari script. Output ONLY the Hindi sentence without quotes, json, or markdown:\n"${responseText}"`
              : `You are an expert multilingual assistant. Translate this response into natural conversational Marathi in standard Devanagari script. Output ONLY the Marathi sentence without quotes, json, or markdown:\n"${responseText}"`;
            const transRes = await provider.generateResponse({
              messages: [{ role: "user", content: transPrompt }],
              tools: [],
              toolChoice: "none",
              responseFormat: "text",
              maxOutputTokens: 500,
              requestId,
              conversationId,
            });
            const rawTrans = (transRes.content ?? "").trim().replace(/^["']|["']$/g, "").trim();
            const cleanTrans = sanitizeResponseText(rawTrans, detectedTurnLang);
            if (cleanTrans && isDevanagari(cleanTrans) && !cleanTrans.startsWith("{") && !cleanTrans.includes('"intent"')) {
              responseText = cleanTrans;
              if (output.responseDraft) output.responseDraft = cleanTrans;
            }
          } catch (transErr) {
            console.warn("[AgentOrchestrator] Fallback translation failed:", transErr);
          }
          if (!isDevanagari(responseText)) {
            logLLMEvent("Application fallback used", {
              requestId,
              model: effectiveModel,
              reason: "TRANSLATION_FAILED_USING_SAFE_TEMPLATE",
            });
            if (detectedTurnLang === "hi") {
              responseText = toolResults.length > 0
                ? "धन्यवाद! मैंने फ़ॉर्म में जानकारी भर दी है। अगला विवरण क्या भरना है?"
                : "मैंने आपका फ़ॉर्म देख लिया है। कृपया बताइए कि आप कौन सा विवरण भरना चाहते हैं?";
            } else if (detectedTurnLang === "mr") {
              responseText = toolResults.length > 0
                ? "धन्यवाद! मी फॉर्ममध्ये तपशील भरला आहे. पुढील तपशील काय भरायचा आहे?"
                : "मी तुमचा फॉर्म पाहिला आहे. कृपया सांगा की तुम्हाला कोणता तपशील भरायचा आहे?";
            }
            if (output.responseDraft) output.responseDraft = responseText;
          }
        } else if (detectedTurnLang === "hinglish" && isDevanagari(responseText)) {
          console.warn(`[AgentOrchestrator] Model emitted Devanagari responseDraft for Hinglish turn. Translating to Hinglish...`);
          try {
            const transRes = await provider.generateResponse({
              messages: [{ role: "user", content: `Convert the following Devanagari text into friendly conversational Hinglish in Latin script. Do not output Devanagari script or pure formal English, output ONLY conversational Hinglish:\n"${responseText}"` }],
              tools: [],
              toolChoice: "none",
              responseFormat: "text",
              maxOutputTokens: 500,
              requestId,
              conversationId,
            });
            const rawTrans = (transRes.content ?? "").trim().replace(/^["']|["']$/g, "").trim();
            const cleanTrans = sanitizeResponseText(rawTrans, detectedTurnLang);
            if (cleanTrans && !isDevanagari(cleanTrans) && !cleanTrans.startsWith("{") && !cleanTrans.includes('"intent"')) {
              responseText = cleanTrans;
              if (output.responseDraft) output.responseDraft = cleanTrans;
            }
          } catch (transErr) {
            console.warn("[AgentOrchestrator] Fallback Hinglish translation failed:", transErr);
          }
          if (isDevanagari(responseText)) {
            logLLMEvent("Application fallback used", {
              requestId,
              model: effectiveModel,
              reason: "HINGLISH_TRANSLATION_FAILED_USING_SAFE_TEMPLATE",
            });
            responseText = toolResults.length > 0
              ? "Maine form mein details fill kar di hain. Next kya bharna hai?"
              : "Maine aapka form dekh liya hai. Aap kaunsa detail pehle bharna chahte hain?";
            if (output.responseDraft) output.responseDraft = responseText;
          }
        } else if (detectedTurnLang === "en" && isDevanagari(responseText)) {
          console.warn(`[AgentOrchestrator] Model emitted Devanagari responseDraft for English turn. Translating to English...`);
          try {
            const transRes = await provider.generateResponse({
              messages: [{ role: "user", content: `Translate the following response into natural conversational English. Output ONLY the English text without markdown:\n"${responseText}"` }],
              tools: [],
              toolChoice: "none",
              responseFormat: "text",
              maxOutputTokens: 500,
              requestId,
              conversationId,
            });
            const rawTrans = (transRes.content ?? "").trim().replace(/^["']|["']$/g, "").trim();
            const cleanTrans = sanitizeResponseText(rawTrans, detectedTurnLang);
            if (cleanTrans && !isDevanagari(cleanTrans) && !cleanTrans.startsWith("{") && !cleanTrans.includes('"intent"')) {
              responseText = cleanTrans;
              if (output.responseDraft) output.responseDraft = cleanTrans;
            }
          } catch (transErr) {
            console.warn("[AgentOrchestrator] Fallback English translation failed:", transErr);
          }
          if (isDevanagari(responseText)) {
            logLLMEvent("Application fallback used", {
              requestId,
              model: effectiveModel,
              reason: "ENGLISH_TRANSLATION_FAILED_USING_SAFE_TEMPLATE",
            });
            responseText = toolResults.length > 0
              ? "Thank you! I have filled the requested details. What would you like to fill next?"
              : "I can see your form. Which detail would you like to fill first?";
            if (output.responseDraft) output.responseDraft = responseText;
          }
        }

        // Ultimate sanitization guarantee: intercept false claims and raw schema
        responseText = sanitizeFalseExecutionClaims(responseText, context, detectedTurnLang, toolResults);
        responseText = sanitizeResponseText(responseText, detectedTurnLang);

        finalResponseSuccess = true;
        logLLMEvent("Final response generated", {
          requestId,
          effectiveModel,
          outcome: "success",
        });

        return {
          response: responseText,
          intent: output.intent,
          language: output.language,
          decision: output.decision,
          context,
          toolResults,
        };
      }

      if (toolsExecuted) {
        failureStage = "tool_execution";
        failureReason = "MULTIPLE_TOOL_ROUNDS_PROHIBITED";
        throw new HttpError(502, "INVALID_AGENT_RESPONSE", "The assistant requested another operation after tool execution");
      }
      if (response.toolCalls.length > MAX_TOOL_CALLS) {
        failureStage = "tool_validation";
        failureReason = "TOOL_LIMIT_EXCEEDED";
        throw new HttpError(400, "TOOL_LIMIT_EXCEEDED", "Too many operations were requested");
      }

      totalToolCallCount += response.toolCalls.length;
      if (response.model) {
        effectiveModel = response.model;
        if (!modelsUsed.includes(response.model)) modelsUsed.push(response.model);
      }
      roundModels.push({
        round: iteration + 1,
        model: response.model || effectiveModel,
        outcome: "tools_invoked",
        toolCallCount: response.toolCalls.length,
      });
      const toolNames = response.toolCalls.map((call) => call.name).join(", ");
      logLLMEvent("Tool calls detected", {
        requestId,
        model: effectiveModel,
        toolCallCount: response.toolCalls.length,
        tools: toolNames,
      });

      messages.push({
        role: "assistant",
        content: response.content ?? null,
        toolCalls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        if (toolResults.some((result) => result.toolCallId === call.id)) continue;
        const tool = findTool(call.name);
        if (!tool) {
          failureStage = "tool_validation";
          failureReason = "UNKNOWN_TOOL";
          throw new HttpError(400, "UNKNOWN_TOOL", "The requested operation is not available");
        }
        try {
          let argumentsValue: unknown;
          try {
            argumentsValue = JSON.parse(call.arguments);
          } catch {
            logLLMEvent("Tool arguments invalid", {
              requestId,
              tool: call.name,
              outcome: "validation_failure",
            });
            failureStage = "tool_validation";
            failureReason = "INVALID_TOOL_ARGUMENTS";
            throw new HttpError(400, "INVALID_TOOL_ARGUMENTS", "The requested operation had invalid arguments");
          }
          const data = await tool.execute(userId, context, argumentsValue);
          console.log(`[AgentOrchestrator] Executed tool ${call.name} successfully:`, data);
          logLLMEvent("Tool execution completed", {
            requestId,
            tool: call.name,
            outcome: "success",
          });
          toolResults.push({ toolCallId: call.id, name: call.name, success: true, data });
          let toolConfirmationDirective = "";
          if (detectedTurnLang === "hi") {
            toolConfirmationDirective = "Tool executed and detail noted. Output final JSON with responseDraft in natural HINDI Devanagari script confirming you have noted this detail (e.g. 'मैंने यह जानकारी नोट कर ली है।') and asking for the next missing field. Never claim you filled it on the webpage ('भर दिया है') before DOM execution.";
          } else if (detectedTurnLang === "mr") {
            toolConfirmationDirective = "Tool executed and detail noted. Output final JSON with responseDraft in natural MARATHI Devanagari script confirming you noted the detail (e.g. 'मी ही माहिती नोंदवून घेतली आहे.') and asking for the next missing field.";
          } else if (detectedTurnLang === "hinglish") {
            toolConfirmationDirective = "Tool executed and detail noted. Output final JSON with responseDraft in natural conversational HINGLISH in Latin script confirming you noted the detail (e.g. 'Maine ye detail note kar li hai.') and asking for the next missing field.";
          } else {
            toolConfirmationDirective = "Tool executed and detail noted. Output final JSON with responseDraft in clear, natural ENGLISH confirming you noted this detail (e.g. 'I have noted this detail.') and asking for the next missing field.";
          }
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify({
              success: true,
              data,
              mandatoryDirective: toolConfirmationDirective,
            }),
          });
        } catch (toolExecErr) {
          console.warn(`[AgentOrchestrator] Failed executing tool ${call.name}:`, toolExecErr);
          logLLMEvent("Tool execution completed", {
            requestId,
            tool: call.name,
            outcome: "failed",
          });
          if (toolExecErr instanceof HttpError) throw toolExecErr;
          toolResults.push({ toolCallId: call.id, name: call.name, success: false });
          messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ success: false }) });
        }
      }
      toolsExecuted = true;
    }

    failureStage = "orchestration";
    failureReason = "AGENT_ITERATION_LIMIT";
    throw new HttpError(409, "AGENT_ITERATION_LIMIT", "The assistant could not complete this request safely");
  } catch (error: any) {
    if (!failureStage) {
      failureStage = "orchestration";
      failureReason = error instanceof HttpError ? error.code : error?.message || "ORCHESTRATION_ERROR";
    }
    throw error;
  } finally {
    logLLMTurnSummary({
      requestId,
      conversationId,
      provider: effectiveProvider,
      effectiveModel: effectiveModel !== "unknown" ? effectiveModel : "none",
      attemptCount: Math.max(1, totalAttemptCount),
      fallbackUsed,
      fallbackReasons,
      modelsAttempted: modelsAttempted.length > 0 ? modelsAttempted : undefined,
      modelsUsed: modelsUsed.length > 0 ? modelsUsed : undefined,
      roundModels: roundModels.length > 0 ? roundModels : undefined,
      providerSuccess,
      parseSuccess,
      structuredResponseValid,
      validationStatus,
      toolCallCount: totalToolCallCount,
      finalResponseSuccess,
      totalLatencyMs: Date.now() - turnStartTime,
      failureStage: finalResponseSuccess ? undefined : failureStage,
      failureReason: finalResponseSuccess ? undefined : failureReason,
    });
  }
}
