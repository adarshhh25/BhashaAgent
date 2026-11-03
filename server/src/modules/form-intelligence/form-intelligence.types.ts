export type MappingStatus =
  | "proposed"
  | "missing"
  | "conflict"
  | "invalid"
  | "unsupported"
  | "requires_manual_review"
  | "already_approved";

export type MappingSource =
  | "approved_profile"
  | "conversation_answer"
  | "existing_task_value"
  | "user_explicit_instruction";

export interface NormalizedField {
  id: string;
  fieldIdentifier: string;
  label: string;
  searchableText: string;
  inputType: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  options: unknown[];
  groupName?: string;
}

export interface MappingSourceReference {
  memoryId?: string;
  messageId?: string;
  fieldValueId?: string;
}

export interface MappingCandidate {
  source: MappingSource;
  sourceReference: MappingSourceReference;
  sourceKey?: string;
  value: unknown;
  score: number;
  labelScore: number;
}

export interface FieldMappingResult {
  fieldId: string;
  fieldIdentifier: string;
  label: string;
  status: MappingStatus;
  proposedValue: unknown;
  source?: MappingSource;
  sourceReference?: MappingSourceReference;
  confidence: number;
  reason: string;
  conflicts?: Array<{
    source: MappingSource;
    sourceReference: MappingSourceReference;
  }>;
}

export interface MappingSummary {
  totalFields: number;
  proposed: number;
  alreadyApproved: number;
  missing: number;
  conflicts: number;
  invalid: number;
  manualReview: number;
  requiresUserAttention: boolean;
}

export interface FormIntelligenceResult {
  taskId: string;
  taskVersion: number;
  mappingVersion: number;
  results: FieldMappingResult[];
  summary: MappingSummary;
}
