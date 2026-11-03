import { z } from "zod";
import { getConversationContext } from "../conversations/context.service";
import { getRelevantMemories, createProposal } from "../memories/memory.service";
import { getTask, listTasks, setFieldValue } from "../form-tasks/form-task.service";
import { runIntelligentMapping } from "../form-intelligence/form-intelligence.service";
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

const fieldValueTool: AgentTool = {
  definition: { name: "propose_field_value", description: "Propose a value for a field in the selected current task. This never approves or fills it.", inputSchema: { type: "object", properties: { taskId: { type: "string" }, fieldId: { type: "string" }, value: {}, source: { type: "string" }, confidence: { type: "number" } }, required: ["taskId", "fieldId", "value", "source"] } },
  execute: async (userId, context, args) => {
    const input = z.object({ taskId: z.string().uuid(), fieldId: z.string().uuid(), value: z.unknown(), source: z.enum(["USER_PROVIDED", "CONVERSATION", "USER_INPUT", "AI_SUGGESTION", "AGENT_PROPOSED"]), confidence: z.number().min(0).max(1).optional() }).strict().parse(args);
    if (context.formTask.id !== input.taskId) throw new Error("Field task is not the selected task");
    const field = context.formTask.detectedFields.find((candidate) => candidate.id === input.fieldId);
    if (!field) throw new Error("Field is not part of the selected task");
    const result = await setFieldValue(userId, input.taskId, input.fieldId, { value: input.value as never, source: input.source, confidence: input.confidence });
    return field.inputType.toLowerCase() === "password"
      ? { id: result.id, status: result.status, executionStatus: result.executionStatus, redacted: true }
      : result;
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
