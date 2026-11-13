import { z } from "zod";
import { getConversationContext } from "../conversations/context.service";
import { getRelevantMemories, createProposal } from "../memories/memory.service";
import { getTask, listTasks, setFieldValue } from "../form-tasks/form-task.service";
import { runIntelligentMapping } from "../form-intelligence/form-intelligence.service";
import { conceptForText } from "../form-intelligence/field-matcher.service";
import { matchOption, type FormOption } from "../form-intelligence/option-matcher.service";
import type { AgentContext } from "../context/context.types";
import type { LLMToolDefinition } from "../llm/llm.types";

export interface AgentTool {
  definition: LLMToolDefinition;
  execute(userId: string, context: AgentContext, args: unknown): Promise<unknown>;
}

const contextTool: AgentTool = {
  definition: { name: "retrieve_context", description: "Refresh the current trusted context.", inputSchema: { type: "object", properties: {} } },
  execute: async (_userId, context) => context,
};

const memoriesTool: AgentTool = {
  definition: { name: "retrieve_approved_memories", description: "Retrieve approved profile facts for this user.", inputSchema: { type: "object", properties: {} } },
  execute: async (userId) => getRelevantMemories({ userId, limit: 50 }),
};

const tasksTool: AgentTool = {
  definition: { name: "list_form_tasks", description: "List form tasks in the current conversation.", inputSchema: { type: "object", properties: {} } },
  execute: async (userId, context) => listTasks(userId, { page: 1, limit: 50, conversationId: context.conversation.id }),
};

const taskTool: AgentTool = {
  definition: { name: "retrieve_form_task", description: "Retrieve one explicitly selected current form task.", inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] } },
  execute: async (userId, context, args) => {
    const input = z.object({ taskId: z.string().uuid() }).strict().parse(args);
    const result = await getTask(userId, input.taskId);
    if (result.task.conversationId !== context.conversation.id) throw new Error("Task is not part of this conversation");
    return context.formTask.id === input.taskId ? context.formTask : { id: result.task.id, status: result.task.status, version: result.task.version };
  },
};

const proposalTool: AgentTool = {
  definition: { name: "propose_profile_memory", description: "Create a pending profile-memory proposal; never approves it.", inputSchema: { type: "object", properties: { operation: { type: "string", enum: ["CREATE", "UPDATE", "DELETE"] }, category: { type: "string" }, key: { type: "string" }, proposedValue: {}, existingMemoryId: { type: "string" } }, required: ["operation", "category", "key", "proposedValue"] } },
  execute: async (userId, context, args) => {
    const input = z.object({
      operation: z.enum(["CREATE", "UPDATE", "DELETE"]),
      category: z.string().trim().min(1).max(100),
      key: z.string().trim().min(1).max(150),
      proposedValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.string(), z.unknown())]),
      existingMemoryId: z.string().uuid().optional(),
    }).strict().parse(args);
    return createProposal({
      userId, operation: input.operation, category: input.category as never, key: input.key,
      proposedValue: input.proposedValue as never, sourceConversationId: context.conversation.id,
      existingMemoryId: input.existingMemoryId,
      sourceMessageId: context.request.currentUserMessage.id,
    });
  },
};

function findTargetField(
  targetIdOrName: string,
  fields: AgentContext["formTask"]["detectedFields"],
) {
  const search = targetIdOrName.toLowerCase().trim();
  // 1. Direct match on id, identifier, name, or label
  const direct = fields.find((candidate) =>
    candidate.id === targetIdOrName ||
    (candidate.fieldIdentifier && candidate.fieldIdentifier.toLowerCase() === search) ||
    (candidate.name && candidate.name.toLowerCase() === search) ||
    (candidate.label && candidate.label.toLowerCase() === search) ||
    (candidate.label && candidate.label.toLowerCase().includes(search)) ||
    (candidate.label && search.includes(candidate.label.toLowerCase()))
  );
  if (direct) return direct;

  // 2. Multilingual semantic concept matching (e.g. "दूरभाष" / "फोन" -> "Telephone Number")
  const searchConcept = conceptForText(targetIdOrName);
  if (searchConcept) {
    const conceptMatch = fields.find((candidate) => {
      const candidateConcept =
        conceptForText(candidate.label || "") ||
        conceptForText(candidate.name || "") ||
        conceptForText(candidate.fieldIdentifier || "");
      return candidateConcept === searchConcept;
    });
    if (conceptMatch) return conceptMatch;
  }

  return undefined;
}

function resolveMultilingualFieldValue(field: AgentContext["formTask"]["detectedFields"][number], rawValue: unknown): unknown {
  if (field.options && Array.isArray(field.options) && field.options.length > 0) {
    const matchRes = matchOption(rawValue, field.options as FormOption[]);
    if (matchRes.matched && matchRes.option) {
      return matchRes.option.value;
    }
  }
  return rawValue;
}

export function isValueGroundedInUserUtterance(
  field: AgentContext["formTask"]["detectedFields"][number],
  value: unknown,
  context: AgentContext,
): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return true;

  const userMsg = (context.request.currentUserMessage.content || "").toLowerCase().trim();
  const valStr = String(value).toLowerCase().trim();

  // 1. Check if user utterance directly matches an option for this field
  if (field.options && Array.isArray(field.options) && field.options.length > 0) {
    const matchRes = matchOption(value, field.options as FormOption[]);
    if (matchRes.matched) {
      // Also verify user mentioned the concept or option
      const optVal = String(matchRes.option?.value || "").toLowerCase();
      const optLabel = String(matchRes.option?.label || "").toLowerCase();
      if (userMsg.includes(optVal) || userMsg.includes(optLabel) || userMsg.includes(valStr) || matchOption(userMsg, field.options as FormOption[]).matched) {
        return true;
      }
    }
  }

  // 2. Direct string match in current user message
  if (userMsg.includes(valStr)) return true;

  // 3. Multi-token name/address/instruction match
  const tokens = valStr.split(/[\s,]+/).filter((t) => t.length >= 2);
  if (tokens.length > 0 && tokens.every((t) => userMsg.includes(t))) return true;

  // 4. Number/digit matching for phone/numeric fields
  const digits = valStr.replace(/\D/g, "");
  if (digits.length >= 4 && userMsg.replace(/\D/g, "").includes(digits)) return true;

  // 5. Check recent conversation messages from the user
  const recent = context.conversation.recentMessages || [];
  for (const m of recent) {
    if (m.role === "USER" || (m.role as string) === "user") {
      const pastContent = (m.content || "").toLowerCase();
      if (pastContent.includes(valStr)) return true;
      if (tokens.length > 0 && tokens.every((t) => pastContent.includes(t))) return true;
      if (digits.length >= 4 && pastContent.replace(/\D/g, "").includes(digits)) return true;
    }
  }

  // 6. Explicit user authorization for profile memory
  const userRequestedProfile = /\b(profile|saved|मेरी प्रोफाइल|माझी प्रोफाईल|माझे तपशील|saved details|use saved|fill from profile)\b/i.test(userMsg);
  if (userRequestedProfile && context.profileMemory?.approvedFacts) {
    for (const fact of context.profileMemory.approvedFacts) {
      if (String(fact.value).toLowerCase().trim() === valStr) return true;
    }
  }

  return false;
}

const fieldValueTool: AgentTool = {
  definition: {
    name: "propose_field_value",
    description: "Fill or propose a value for one or more fields in the active webpage form. Must be invoked whenever the user provides field details, selects radio/checkbox options, or supplies information to enter into the page.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        fieldId: { type: "string", description: "The field id, identifier, name, or label" },
        value: {},
        source: { type: "string" },
        confidence: { type: "number" },
        proposals: {
          type: "array",
          description: "Optional batch of multiple field proposals",
          items: {
            type: "object",
            properties: {
              fieldId: { type: "string" },
              value: {},
              source: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["fieldId", "value", "source"],
          },
        },
      },
      required: ["taskId"],
    },
  },
  execute: async (userId, context, args) => {
    const input = z.object({
      taskId: z.string().uuid(),
      fieldId: z.string().min(1).optional(),
      value: z.unknown().optional(),
      source: z.enum(["USER_PROVIDED", "CONVERSATION", "USER_INPUT", "AI_SUGGESTION", "AGENT_PROPOSED"]).optional(),
      confidence: z.number().min(0).max(1).optional(),
      proposals: z.array(z.object({
        fieldId: z.string().min(1),
        value: z.unknown(),
        source: z.enum(["USER_PROVIDED", "CONVERSATION", "USER_INPUT", "AI_SUGGESTION", "AGENT_PROPOSED"]),
        confidence: z.number().min(0).max(1).optional(),
      })).optional(),
    }).strict().parse(args);

    if (context.formTask.id !== input.taskId) throw new Error("Field task is not the selected task");

    // Handle batch proposals
    if (input.proposals && input.proposals.length > 0) {
      const results = [];
      for (const proposal of input.proposals) {
        const field = findTargetField(proposal.fieldId, context.formTask.detectedFields);
        if (!field) continue;
        const resolvedValue = resolveMultilingualFieldValue(field, proposal.value);

        // Verify information provenance: value must be grounded in user conversation
        if (!isValueGroundedInUserUtterance(field, resolvedValue, context)) {
          console.warn(`[AgentTools] ProposeFieldValue: Skipping ungrounded/fabricated value for field "${field.label || field.id}": "${resolvedValue}"`);
          continue;
        }

        const res = await setFieldValue(userId, input.taskId, field.id, {
          value: resolvedValue as never,
          source: proposal.source,
          confidence: proposal.confidence,
        });
        results.push({
          id: res.id,
          fieldId: field.id,
          fieldIdentifier: field.fieldIdentifier,
          label: field.label,
          inputType: field.inputType,
          value: resolvedValue,
          status: res.status,
          redacted: field.inputType.toLowerCase() === "password",
        });
      }
      return { taskId: input.taskId, updatedCount: results.length, results };
    }

    // Handle single field proposal
    if (!input.fieldId || input.value === undefined || !input.source) {
      throw new Error("Either proposals or fieldId, value, and source are required");
    }

    const field = findTargetField(input.fieldId, context.formTask.detectedFields);
    if (!field) throw new Error("Field is not part of the selected task");
    const resolvedValue = resolveMultilingualFieldValue(field, input.value);

    // Verify information provenance: value must be grounded in user conversation
    if (!isValueGroundedInUserUtterance(field, resolvedValue, context)) {
      console.warn(`[AgentTools] ProposeFieldValue: Rejecting ungrounded/fabricated value for field "${field.label || field.id}": "${resolvedValue}"`);
      return {
        id: "rejected",
        fieldId: field.id,
        fieldIdentifier: field.fieldIdentifier,
        label: field.label,
        inputType: field.inputType,
        value: resolvedValue,
        status: "REJECTED_UNGROUNDED",
        message: "Value was not provided or authorized by the user in conversation",
        redacted: field.inputType.toLowerCase() === "password",
      };
    }

    const result = await setFieldValue(userId, input.taskId, field.id, { value: resolvedValue as never, source: input.source, confidence: input.confidence });
    return {
      id: result.id,
      fieldId: field.id,
      fieldIdentifier: field.fieldIdentifier,
      label: field.label,
      inputType: field.inputType,
      value: resolvedValue,
      status: result.status,
      executionStatus: result.executionStatus,
      redacted: field.inputType.toLowerCase() === "password",
    };
  },
};

const intelligentMappingTool: AgentTool = {
  definition: {
    name: "run_intelligent_mapping",
    description: "Analyze the selected form task and propose trusted field values. This never approves, fills, or submits a form.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, expectedVersion: { type: "number" } },
      required: ["taskId"],
    },
  },
  execute: async (userId, context, args) => {
    const input = z.object({
      taskId: z.string().uuid(),
      expectedVersion: z.number().int().positive().optional(),
    }).strict().parse(args);
    if (context.formTask.id !== input.taskId) throw new Error("Form task is not the selected task");
    const result = await runIntelligentMapping(userId, input.taskId, input.expectedVersion);
    return {
      taskId: result.taskId,
      taskVersion: result.taskVersion,
      summary: result.summary,
      results: result.results.slice(0, 100),
    };
  },
};

export const agentTools: AgentTool[] = [contextTool, memoriesTool, tasksTool, taskTool, proposalTool, fieldValueTool, intelligentMappingTool];
export const toolDefinitions = agentTools.map((tool) => tool.definition);

export function findTool(name: string): AgentTool | undefined {
  return agentTools.find((tool) => tool.definition.name === name);
}
