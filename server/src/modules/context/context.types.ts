export type CurrentMessageSource = "text" | "voice_transcript" | "unknown";

export interface ContextSourceReference {
  type: "message" | "memory" | "task" | "field" | "field_value" | "approval";
  id: string;
  createdAt?: string;
}

export interface ContextMessage {
  id?: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  language?: string;
  createdAt?: string;
  corrected: boolean;
  revisionCount: number;
  latestCorrectedAt?: string;
  sourceReference?: ContextSourceReference;
}

export interface ContextCorrection {
  messageId: string;
  revisionCount: number;
  latestCorrectedAt?: string;
}

export interface ContextProfileFact {
  id: string;
  category: string;
  key: string;
  value: unknown;
  confidence?: number;
  approvalStatus: "APPROVED";
  sourceReference?: ContextSourceReference;
  provenance?: {
    conversationId?: string;
    messageId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ContextDetectedField {
  id: string;
  fieldIdentifier: string;
  fieldKey?: string;
  label: string;
  name?: string;
  elementType: string;
  inputType: string;
  placeholder?: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  status: string;
  detectedOrder?: number;
  groupName?: string;
  sectionName?: string;
  detectionConfidence?: number;
  options?: unknown;
  sourceReference: ContextSourceReference;
}

export interface ContextFieldValue {
  id: string;
  fieldId: string;
  value: unknown;
  redacted: boolean;
  source: string;
  confidence?: number;
  approvalStatus: string;
  executionStatus: string;
  sourceMemoryId?: string;
  correctionCount: number;
  createdAt: string;
  updatedAt: string;
  sourceReference: ContextSourceReference;
}

export interface WebpageContext {
  url: string;
  title?: string;
  domain?: string;
  metadata?: unknown;
  detectedAt?: string;
}

export interface MissingInformation {
  fieldId: string;
  label: string;
  required: boolean;
  reason: string;
  clarificationRequired: boolean;
}

export interface ContextApprovalState {
  status: string;
  valid: boolean;
  approvalId?: string;
  taskVersion?: number;
  approvedAt?: string;
}

export interface ContextOmission {
  type: "message" | "memory" | "field" | "field_value";
  id?: string;
  reason: string;
}

export interface ContextWarning {
  code: string;
  message: string;
}

export interface AgentContext {
  schemaVersion: "1.0";
  request: {
    requestId: string;
    createdAt: string;
    currentUserMessage: {
      id?: string;
      content: string;
      language?: string;
      source: CurrentMessageSource;
      createdAt?: string;
    };
  };
  user: {
    id: string;
    preferredLanguage?: string;
  };
  conversation: {
    id: string;
    status: string;
    recentMessages: ContextMessage[];
    summary?: string;
    relevantOlderContext: ContextMessage[];
    corrections: ContextCorrection[];
  };
  profileMemory: {
    approvedFacts: ContextProfileFact[];
    excludedPendingCount?: number;
    excludedRejectedCount?: number;
    excludedInactiveCount?: number;
  };
  formTask: {
    id?: string;
    status?: string;
    version?: number;
    webpage?: WebpageContext;
    detectedFields: ContextDetectedField[];
    proposedValues: ContextFieldValue[];
    missingInformation: MissingInformation[];
    approvalState?: ContextApprovalState;
  };
  contextMetadata: {
    builtAt: string;
    sourceCounts: {
      recentMessages: number;
      olderMessages: number;
      approvedMemories: number;
      detectedFields: number;
      proposedValues: number;
    };
    truncated: boolean;
    omittedItems: ContextOmission[];
    warnings: ContextWarning[];
    sourceReferences: ContextSourceReference[];
  };
}

export interface BuildAgentContextInput {
  userId: string;
  conversationId: string;
  currentMessage:
    | { messageId: string }
    | { content: string; language?: string; source?: CurrentMessageSource };
  formTaskId?: string;
  options?: {
    includeOlderContext?: boolean;
    includeProfileMemory?: boolean;
    includeFormTask?: boolean;
    maxRecentMessages?: number;
    maxOlderMessages?: number;
  };
}

export interface BuildAgentContextResult {
  success: true;
  context: AgentContext;
  taskResolution: {
    status: "resolved" | "not_requested" | "ambiguous";
    selectedTaskId?: string;
    candidateTaskIds?: string[];
  };
}
