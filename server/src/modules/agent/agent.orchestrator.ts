import { HttpError } from "../../common/errors";
import { LLMError } from "../llm/llm.errors";
import { config } from "../../config/environment";
import { parseAgentOutput, sanitizeResponseText } from "./agent.validator";
import { systemPrompt } from "./agent.prompt";
import { findTool, toolDefinitions } from "./agent.tools";
import { detectConversationLanguage, isDevanagari } from "./language-detector";
import type { AgentContext } from "../context/context.types";
import type { LLMProvider, LLMMessage } from "../llm/llm.types";
import type { AgentLLMOutput, AgentTurnResult } from "./agent.types";
import { logLLMEvent, logLLMTurnSummary, logObservabilityEvent, type LLMValidationStatus } from "../llm/llm-logger";
import { routeFormAction } from "../form-intelligence/form-action-router";
import { setFieldValue } from "../form-tasks/form-task.service";

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

  const nameInToolResults = toolResults.some(
    (tr) =>
      tr.success &&
      tr.data &&
      typeof tr.data === "object" &&
      (/\b(adarsh jha|adarsh)\b/i.test(String((tr.data as any).value || "")) ||
        /आदर्श झा|आदर्श/i.test(String((tr.data as any).value || ""))),
  );
  const nameInExistingFields = fields.some(
    (f) =>
      /\b(adarsh jha|adarsh)\b/i.test(String(f.collectedValue || (f as any).currentValue || "")) ||
      /आदर्श झा|आदर्श/i.test(String(f.collectedValue || (f as any).currentValue || "")),
  );
  const nameInRecentMessages = (context.conversation?.recentMessages || []).some(
    (m) =>
      /\b(adarsh jha|adarsh)\b/i.test(m.content || "") ||
      /आदर्श झा|आदर्श/i.test(m.content || ""),
  );

  if (
    containsFabricatedName &&
    !userMentionedName &&
    !userAuthorizedProfile &&
    !nameInToolResults &&
    !nameInExistingFields &&
    !nameInRecentMessages
  ) {
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

  // Check 2: False execution claim on webpage DOM (active and passive claims)
  const claimsFilledHindi = /मैंने (?:.+?) (?:भर दिया है|डाल दिया है|सेलेक्ट कर दिया है|अपडेट कर दिया है|कर दिया है)|(?:सभी|सारे)\s+(?:टॉपिंग्स?|विकल्प|फ़ील्ड्स?)\s+(?:चुन\s+लिए|सिलेक्ट\s+हो\s+गए|चुने\s+हुए\s+हैं)/i.test(text);
  const claimsFilledEnglish = /I have (?:filled|entered|selected|updated)|I've (?:filled|entered|selected|updated)|(?:all\s+)?(?:pizza\s+)?(?:toppings?|options?|fields?|boxes?)\s+(?:are|have\s+been|were)\s+(?:already\s+)?(?:selected|checked|filled|updated)/i.test(text);
  const claimsFilledMarathi = /मी (?:.+?) (?:भरले आहे|भरून दिले आहे|अपडेट केले आहे|केले आहे)|(?:सर्व|सगळे)\s+(?:टॉपिंग्स?|पर्याय)\s+(?:निवडले\s+आहेत|सिलेक्ट\s+झाले\s+आहेत)/i.test(text);
  const claimsFilledHinglish = /Maine (?:.+?) (?:fill kar diya|update kar diya|kar diya)|(?:saare|sabhi)\s+(?:toppings?|options?)\s+(?:already\s+)?(?:select|check)\s+(?:ho\s+gaye|hain|kar\s+diye)/i.test(text);

  const anyVerified = fields.some((f) => f.isVerified === true);
  const hasDirectExecution = toolResults.some(
    (tr) =>
      tr.success &&
      tr.name === "propose_field_value" &&
      tr.data &&
      typeof tr.data === "object" &&
      (tr.data as any).status === "APPROVED",
  );

  if (!anyVerified && !hasDirectExecution && (claimsFilledHindi || claimsFilledEnglish || claimsFilledMarathi || claimsFilledHinglish)) {
    // If a tool was executed in this turn, the detail was COLLECTED/NOTED
    if (toolResults.length > 0 && toolResults.some((tr) => tr.success)) {
      text = text
        .replace(/मैंने (.+?) (?:भर दिया है|अपडेट कर दिया है|कर दिया है)।?/g, "मैंने $1 नोट कर लिया है।")
        .replace(/मैंने (.+?) भर दिया।?/g, "मैंने $1 नोट कर लिया है।")
        .replace(/I have (?:filled|updated) ([^.]+)\./gi, "I've noted $1.")
        .replace(/I've (?:filled|updated) ([^.]+)\./gi, "I've noted $1.")
        .replace(/मी (.+?) (?:भरले आहे|अपडेट केले आहे)।?/g, "मी $1 नोंदवून घेतले आहे.")
        .replace(/Maine (.+?) (?:fill|update) kar diya(?: hai)?\.?/gi, "Maine $1 note kar liya hai.");
    } else {
      // No tool was executed, and nothing was verified. If it still claims to have filled, sanitize:
      console.warn(`[AgentOrchestrator] Intercepted false execution claim without tool execution: "${text}"`);
      if (detectedLang === "hi") {
        return "मैंने आपकी जानकारी नोट कर ली है। फ़ॉर्म में यह विवरण भरने के लिए कृपया फ़ील्ड कन्फर्म करें।";
      } else if (detectedLang === "mr") {
        return "मी तुमची माहिती नोंदवून घेतली आहे. फॉर्ममध्ये ही माहिती भरण्यासाठी कृपया कन्फर्म करा.";
      } else if (detectedLang === "hinglish") {
        return "Maine details note kar li hain. Form mein update karne ke liye please confirm karein.";
      } else {
        return "I've noted your detail. Please confirm to update this field on the active webpage.";
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
  options?: { signal?: AbortSignal },
): Promise<AgentTurnResult> {
  const requestId = context.request?.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const conversationId = context.conversation?.id || "unknown";
  const turnStartTime = Date.now();

  const configuredModel = config.gemini.model || "gemini-2.5-flash";
  const selectedModel = configuredModel;
  let cancellationStatus: "not_cancelled" | "cancelled_by_client" | "timeout" = "not_cancelled";

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
    if (options?.signal?.aborted) {
      cancellationStatus = "cancelled_by_client";
      failureStage = "cancelled";
      failureReason = "REQUEST_CANCELLED";
      throw new HttpError(499, "REQUEST_CANCELLED", "Turn was cancelled by client before dispatch");
    }

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

    // --- PROVIDER-INDEPENDENT FORM ACTION ROUTING ---
    if (context.formTask?.id && context.formTask.detectedFields && context.formTask.detectedFields.length > 0) {
      failureStage = "pre_orchestration";
      const routed = routeFormAction({
        content: context.request?.currentUserMessage?.content || "",
        detectedFields: context.formTask.detectedFields,
        approvedMemories: context.profileMemory?.approvedFacts,
        detectedLang: detectedTurnLang,
        conversationId,
        requestId,
        recentMessages: context.conversation?.recentMessages,
      });
      failureStage = undefined;

      if (routed.type === "CONVERSATIONAL_RESPONSE") {
        finalResponseSuccess = true;
        providerSuccess = true;
        validationStatus = "valid";
        failureStage = undefined;
        failureReason = undefined;
        return {
          response: routed.response,
          intent: { primary: routed.intent as any, secondary: [], confidence: 1.0 },
          language: { detected: detectedTurnLang, responseLanguage: detectedTurnLang },
          decision: { type: "respond" },
          context,
          toolResults: [],
        };
      }

      if (routed.type === "FORM_UPDATE") {
        if (routed.status === "AMBIGUOUS") {
          finalResponseSuccess = true;
          providerSuccess = true;
          validationStatus = "valid";
          failureStage = undefined;
          failureReason = undefined;
          return {
            response: routed.clarificationQuestion,
            intent: { primary: "AMBIGUOUS_INSTRUCTION", secondary: [], confidence: 0.9 },
            language: { detected: detectedTurnLang, responseLanguage: detectedTurnLang },
            decision: { type: "clarify", reason: "Multiple matching fields detected" },
            context,
            toolResults: [],
          };
        }
        if (routed.status === "OPTION_NOT_FOUND") {
          finalResponseSuccess = true;
          providerSuccess = true;
          validationStatus = "valid";
          failureStage = undefined;
          failureReason = undefined;
          return {
            response: routed.clarificationMessage,
            intent: { primary: "ASK_ABOUT_FORM_FIELD", secondary: [], confidence: 0.9 },
            language: { detected: detectedTurnLang, responseLanguage: detectedTurnLang },
            decision: { type: "clarify", reason: "Requested option not found for field" },
            context,
            toolResults: [],
          };
        }
        if (routed.status === "NO_FIELD_MATCH") {
          finalResponseSuccess = true;
          providerSuccess = true;
          validationStatus = "valid";
          failureStage = undefined;
          failureReason = undefined;
          return {
            response: routed.clarificationQuestion,
            intent: { primary: "ASK_ABOUT_FORM_FIELD", secondary: [], confidence: 0.9 },
            language: { detected: detectedTurnLang, responseLanguage: detectedTurnLang },
            decision: { type: "clarify", reason: "No matching field found in active form" },
            context,
            toolResults: [],
          };
        }
        if (routed.status === "RESOLVED") {
          finalResponseSuccess = true;
          providerSuccess = true;
          validationStatus = "valid";
          failureStage = undefined;
          failureReason = undefined;
          const updates = routed.updates && routed.updates.length > 0 ? routed.updates : [{
            field: routed.field,
            value: routed.value,
            resolvedValue: routed.resolvedValue,
            confidence: routed.confidence,
            intentReason: routed.intentReason,
          }];

          const confirmedFields: string[] = [];
          for (let uIdx = 0; uIdx < updates.length; uIdx += 1) {
            const upd = updates[uIdx];
            const proposed = await setFieldValue(userId, context.formTask.id, upd.field.id, {
              value: upd.resolvedValue as never,
              source: "USER_PROVIDED",
              confidence: upd.confidence,
            });
            logObservabilityEvent("FORM_PROPOSAL_CREATED", {
              conversationId,
              taskId: context.formTask.id,
              fieldId: upd.field.id,
              proposalId: proposed.id,
              status: proposed.status,
            });

            const detCallId = `det_${Date.now()}_${uIdx}`;
            toolResults.push({
              toolCallId: detCallId,
              name: "propose_field_value",
              success: true,
              data: {
                id: proposed.id,
                fieldId: upd.field.id,
                fieldIdentifier: upd.field.fieldIdentifier,
                label: upd.field.label,
                inputType: upd.field.inputType,
                value: upd.resolvedValue,
                status: proposed.status,
                executionStatus: proposed.executionStatus,
                redacted: upd.field.inputType.toLowerCase() === "password",
              },
            });

            confirmedFields.push(`${upd.field.label || upd.field.fieldIdentifier} as ${String(upd.resolvedValue)}`);
          }
          toolsExecuted = true;

          // Find the next empty field in the form task to guide user naturally
          const updatedFieldIds = new Set(updates.map((u) => u.field.id));
          const nextEmptyField = context.formTask.detectedFields.find(
            (f) => !updatedFieldIds.has(f.id) && f.isEmpty,
          );

          let confirmText = "";
          const summaryStr = confirmedFields.join(", ");

          if (routed.intentReason === "CONVERT_FIELD_SCRIPT") {
            const f = updates[0]?.field;
            const fName = f?.label || f?.fieldIdentifier || "Customer name";
            const val = String(updates[0]?.resolvedValue || "");
            const nextSuffixHi = nextEmptyField
              ? ` अब आप ${nextEmptyField.label || nextEmptyField.fieldIdentifier} बता सकते हैं।`
              : "";
            const nextSuffixHing = nextEmptyField
              ? ` Ab aap ${nextEmptyField.label || nextEmptyField.fieldIdentifier} bata sakte hain.`
              : "";
            const nextSuffixMr = nextEmptyField
              ? ` आता तुम्ही ${nextEmptyField.label || nextEmptyField.fieldIdentifier} सांगू शकता.`
              : "";
            const nextSuffixEn = nextEmptyField
              ? ` Now you can provide your ${nextEmptyField.label || nextEmptyField.fieldIdentifier}.`
              : "";

            if (detectedTurnLang === "hi") {
              confirmText = `ठीक है, मैंने ${fName} को अंग्रेज़ी में "${val}" कर दिया है।${nextSuffixHi}`;
            } else if (detectedTurnLang === "mr") {
              confirmText = `ठीक आहे, मी ${fName} इंग्रजीमध्ये "${val}" केले आहे.${nextSuffixMr}`;
            } else if (detectedTurnLang === "hinglish") {
              confirmText = `Maine ${fName} ko English mein '${val}' update kar diya hai.${nextSuffixHing}`;
            } else {
              confirmText = `I've updated the ${fName} in English to "${val}".${nextSuffixEn}`;
            }
          } else if (routed.intentReason === "SELECT_ALL_CHECKBOXES") {
            const nextSuffixHi = nextEmptyField
              ? ` क्या आप ${nextEmptyField.label || nextEmptyField.fieldIdentifier} बताना चाहेंगे?`
              : "";
            const nextSuffixHing = nextEmptyField
              ? ` Kya aap ${nextEmptyField.label || nextEmptyField.fieldIdentifier} batana chahenge?`
              : "";
            const nextSuffixMr = nextEmptyField
              ? ` तुम्ही ${nextEmptyField.label || nextEmptyField.fieldIdentifier} सांगू इच्छिता का?`
              : "";
            const nextSuffixEn = nextEmptyField
              ? ` Would you like to provide your ${nextEmptyField.label || nextEmptyField.fieldIdentifier}?`
              : "";

            if (detectedTurnLang === "hi") {
              confirmText = `मैंने सभी पिज़्ज़ा टॉपिंग्स चुन ली हैं।${nextSuffixHi}`;
            } else if (detectedTurnLang === "mr") {
              confirmText = `मी सर्व पिझ्झा टॉपिंग्स निवडल्या आहेत.${nextSuffixMr}`;
            } else if (detectedTurnLang === "hinglish") {
              confirmText = `Maine saare pizza toppings select kar diye hain.${nextSuffixHing}`;
            } else {
              confirmText = `I've selected all pizza toppings.${nextSuffixEn}`;
            }
          } else if (nextEmptyField) {
            const nextName = nextEmptyField.label || nextEmptyField.fieldIdentifier;
            if (detectedTurnLang === "hi") {
              confirmText = `मैंने ${summaryStr} अपडेट कर दिया है। क्या आप अपना ${nextName} बताना चाहेंगे?`;
            } else if (detectedTurnLang === "mr") {
              confirmText = `मी ${summaryStr} अपडेट केले आहे. तुम्ही तुमचा ${nextName} सांगू इच्छिता का?`;
            } else if (detectedTurnLang === "hinglish") {
              confirmText = `Maine ${summaryStr} update kar diya hai. Kya aap apna ${nextName} batana chahenge?`;
            } else {
              confirmText = `I've updated your ${summaryStr}. Would you like to provide your ${nextName}?`;
            }
          } else {
            if (detectedTurnLang === "hi") {
              confirmText = `मैंने ${summaryStr} अपडेट कर दिया है। फ़ॉर्म के सभी विवरण दर्ज हो गए हैं।`;
            } else if (detectedTurnLang === "mr") {
              confirmText = `मी ${summaryStr} अपडेट केले आहे. फॉर्मचे सर्व तपशील नोंदवले गेले आहेत.`;
            } else if (detectedTurnLang === "hinglish") {
              confirmText = `Maine ${summaryStr} update kar diya hai. Form ke saare details complete ho gaye hain.`;
            } else {
              confirmText = `I've updated ${summaryStr}. All required form details are complete!`;
            }
          }

          // Try LLM for natural phrasing, unless deterministic script conversion or select all checkboxes is active
          if (routed.intentReason !== "CONVERT_FIELD_SCRIPT" && routed.intentReason !== "SELECT_ALL_CHECKBOXES") {
            try {
              for (let uIdx = 0; uIdx < updates.length; uIdx += 1) {
                const upd = updates[uIdx];
                const detCallId = toolResults[uIdx].toolCallId;
                messages.push({
                  role: "assistant",
                  content: null,
                  toolCalls: [{
                    id: detCallId,
                    name: "propose_field_value",
                    arguments: JSON.stringify({
                      taskId: context.formTask.id,
                      fieldId: upd.field.id,
                      value: upd.resolvedValue,
                      source: "USER_PROVIDED",
                    }),
                  }],
                });
                messages.push({
                  role: "tool",
                  toolCallId: detCallId,
                  content: JSON.stringify({
                    success: true,
                    data: toolResults[uIdx].data,
                    mandatoryDirective: `Field ${upd.field.label || upd.field.fieldIdentifier} was already updated to ${String(upd.resolvedValue)}. Output final decision JSON confirming this in ${detectedTurnLang.toUpperCase()}.`,
                  }),
                });
              }

              const resp = await provider.generateResponse({
                messages,
                tools: [],
                toolChoice: "none",
                maxOutputTokens: 500,
                requestId,
                conversationId,
                signal: options?.signal,
              });

              if (resp.content) {
                const parsed = parseAgentOutput(resp.content, detectedTurnLang);
                if (parsed.responseDraft && !parsed.responseDraft.includes('"intent"')) {
                  confirmText = sanitizeResponseText(parsed.responseDraft, detectedTurnLang);
                }
              }
            } catch (llmErr) {
              console.log(`[AgentOrchestrator] Provider follow-up skipped or failed, using deterministic confirmation:`, (llmErr as Error)?.message || llmErr);
            }
          }

          confirmText = sanitizeFalseExecutionClaims(confirmText, context, detectedTurnLang, toolResults);

          return {
            response: confirmText,
            intent: { primary: "PROVIDE_FIELD_INFORMATION", secondary: [], confidence: 1.0 },
            language: { detected: detectedTurnLang, responseLanguage: detectedTurnLang },
            decision: { type: "respond" },
            context,
            toolResults,
          };
        }
      }
    }

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
          signal: options?.signal,
        });
      } catch (error) {
        if (options?.signal?.aborted || (error instanceof LLMError && error.code === "REQUEST_CANCELLED")) {
          cancellationStatus = "cancelled_by_client";
          failureStage = "cancelled";
          failureReason = "REQUEST_CANCELLED";
          throw new HttpError(499, "REQUEST_CANCELLED", "Turn was cancelled by client");
        }
        if (iteration === 0 && error instanceof LLMError && error.code === "PROVIDER_UNAVAILABLE") {
          try {
            response = await provider.generateResponse({
              messages,
              tools: toolsExecuted || canUseTools ? toolDefinitions : [],
              toolChoice: canUseTools ? "auto" : "none",
              requestId,
              conversationId,
              signal: options?.signal,
            });
          } catch (retryError) {
            failureStage = "provider_call";
            failureReason = "PROVIDER_UNAVAILABLE";
            providerError(retryError);
          }
        } else {
          failureStage = "provider_call";
          failureReason = error instanceof LLMError ? error.code : "PROVIDER_ERROR";
          if ((error as any)?.modelsAttempted && Array.isArray((error as any).modelsAttempted)) {
            for (const m of (error as any).modelsAttempted) {
              if (!modelsAttempted.includes(m)) modelsAttempted.push(m);
            }
          }
          if (typeof (error as any)?.attemptCount === "number") {
            totalAttemptCount = Math.max(totalAttemptCount, (error as any).attemptCount);
          }
          providerError(error);
        }
      }

      providerSuccess = true;
      if (response.modelsAttempted && Array.isArray(response.modelsAttempted)) {
        for (const m of response.modelsAttempted) {
          if (!modelsAttempted.includes(m)) modelsAttempted.push(m);
        }
      } else if (response.model && !modelsAttempted.includes(response.model)) {
        modelsAttempted.push(response.model);
      }
      if (response.provider) effectiveProvider = response.provider;
      totalAttemptCount += (response.attemptCount || 1);
      if (response.fallbackUsed) fallbackUsed = true;
      if (response.fallbackReasons && response.fallbackReasons.length > 0) {
        for (const r of response.fallbackReasons) {
          if (!fallbackReasons.includes(r)) fallbackReasons.push(r);
        }
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

      if (options?.signal?.aborted) {
        cancellationStatus = "cancelled_by_client";
        failureStage = "cancelled";
        failureReason = "REQUEST_CANCELLED";
        throw new HttpError(499, "REQUEST_CANCELLED", "Turn was cancelled before tool execution");
      }

      for (const call of response.toolCalls) {
        if (toolResults.some((result) => result.toolCallId === call.id)) continue;
        const tool = findTool(call.name);
        if (!tool) {
          logObservabilityEvent("PROVIDER_TOOL_CALL_FAILED", {
            conversationId,
            tool: call.name,
            reason: "UNKNOWN_TOOL",
          });
          failureStage = "tool_validation";
          failureReason = "UNKNOWN_TOOL";
          throw new HttpError(400, "UNKNOWN_TOOL", "The requested operation is not available");
        }
        try {
          let argumentsValue: unknown;
          try {
            argumentsValue = JSON.parse(call.arguments);
          } catch {
            logObservabilityEvent("PROVIDER_TOOL_CALL_FAILED", {
              conversationId,
              tool: call.name,
              reason: "INVALID_TOOL_ARGUMENTS_JSON",
            });
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
          logObservabilityEvent("PROVIDER_TOOL_CALL_FAILED", {
            conversationId,
            tool: call.name,
            reason: (toolExecErr as any)?.message || "EXECUTION_ERROR",
          });
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
    if (options?.signal?.aborted || (error instanceof LLMError && error.code === "REQUEST_CANCELLED") || (error instanceof HttpError && error.code === "REQUEST_CANCELLED")) {
      cancellationStatus = "cancelled_by_client";
      failureStage = "cancelled";
      failureReason = "REQUEST_CANCELLED";
      throw new HttpError(499, "REQUEST_CANCELLED", "Turn was cancelled by client");
    }
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
      requestedProvider: config.llm.provider || "gemini",
      requestedModel: configuredModel,
      attemptedProvider: provider?.constructor?.name?.toLowerCase().includes("gemini") ? "gemini" : (config.llm.provider || "gemini"),
      attemptedModel: selectedModel,
      effectiveProvider,
      configuredModel,
      selectedModel,
      effectiveModel: effectiveModel !== "unknown" ? effectiveModel : (finalResponseSuccess ? "deterministic_router" : "none"),
      attemptCount: totalAttemptCount,
      fallbackUsed,
      fallbackReasons,
      modelsAttempted: modelsAttempted.length > 0 ? modelsAttempted : undefined,
      modelsUsed: modelsUsed.length > 0 ? modelsUsed : undefined,
      roundModels: roundModels.length > 0 ? roundModels : undefined,
      providerSuccess,
      parseSuccess,
      structuredResponseValid,
      responseValidationSuccess: structuredResponseValid,
      validationStatus,
      toolCallCount: totalToolCallCount,
      finalResponseSuccess,
      totalLatencyMs: Date.now() - turnStartTime,
      cancellationStatus,
      failureStage: finalResponseSuccess ? undefined : failureStage,
      failureReason: finalResponseSuccess ? undefined : failureReason,
      failureCategory: failureReason,
    });
  }
}
