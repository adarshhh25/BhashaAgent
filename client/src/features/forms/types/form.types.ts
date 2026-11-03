/**
 * Form Intelligence & Form Task Types
 *
 * Derived strictly from Backend Phase 5 & Phase 8:
 * - server/prisma/schema.prisma
 * - server/src/modules/form-tasks/form-task.validator.ts
 * - server/src/modules/form-intelligence/form-intelligence.types.ts
 */

export type FormTaskStatus =
  | 'CREATED'
  | 'FIELDS_DETECTED'
  | 'MAPPING_IN_PROGRESS'
  | 'AWAITING_INFORMATION'
  | 'REVIEW'
  | 'AWAITING_FINAL_APPROVAL'
  | 'APPROVED_FOR_FILLING'
  | 'FILLING'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type FormFieldStatus = 'ACTIVE' | 'REMOVED';

export type FieldValueStatus =
  | 'NOT_REVIEWED'
  | 'PENDING_APPROVAL'
  | 'PROPOSED'
  | 'APPROVED'
  | 'FILLED'
  | 'REJECTED'
  | 'FAILED';

export type FieldExecutionStatus =
  | 'NOT_STARTED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'FILLED'
  | 'SKIPPED'
  | 'FAILED';

export type FieldValueSource =
  | 'USER_PROVIDED'
  | 'PROFILE_MEMORY'
  | 'CONVERSATION'
  | 'USER_INPUT'
  | 'AI_SUGGESTION'
  | 'APPROVED_PROFILE_MEMORY'
  | 'AGENT_PROPOSED'
  | 'SYSTEM_DEFAULT'
  | 'USER_CORRECTED';

export type MappingStatus =
  | 'proposed'
  | 'missing'
  | 'conflict'
  | 'invalid'
  | 'unsupported'
  | 'requires_manual_review'
  | 'already_approved';

export type MappingSource =
  | 'approved_profile'
  | 'conversation_answer'
  | 'existing_task_value'
  | 'user_explicit_instruction';

/**
 * Form Task Record
 */
export interface FormTask {
  id: string;
  userId: string;
  conversationId: string;
  title?: string | null;
  taskType: string;
  webpageUrl: string;
  webpageTitle?: string | null;
  domain?: string | null;
  status: FormTaskStatus;
  taskMetadata?: Record<string, unknown> | null;
  webpageMetadata?: Record<string, unknown> | null;
  version: number;
  detectedAt?: string | null;
  startedAt: string;
  pausedAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    detectedFields?: number;
  };
}

/**
 * Detected Form Field Record
 */
export interface DetectedField {
  id: string;
  formTaskId: string;
  fieldIdentifier: string;
  fieldKey?: string | null;
  label: string;
  name?: string | null;
  elementType: string;
  inputType: string;
  placeholder?: string | null;
  isRequired: boolean;
  isDisabled: boolean;
  isReadOnly: boolean;
  detectedOrder?: number | null;
  groupName?: string | null;
  sectionName?: string | null;
  detectionConfidence?: number | string | null;
  status: FormFieldStatus;
  options?: unknown;
  fieldMetadata?: Record<string, unknown> | null;
  fieldValues?: FieldValue[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Stored Field Value Record
 */
export interface FieldValue {
  id: string;
  detectedFieldId: string;
  value: unknown;
  source: FieldValueSource;
  sourceReferenceId?: string | null;
  sourceMemoryId?: string | null;
  confidence?: number | string | null;
  status: FieldValueStatus;
  executionStatus: FieldExecutionStatus;
  dataType?: string | null;
  attemptCount: number;
  approvedAt?: string | null;
  filledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Phase 8 Intelligent Mapping Results
 */
export interface MappingSourceReference {
  memoryId?: string;
  messageId?: string;
  fieldValueId?: string;
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

/**
 * Missing Information
 */
export interface MissingInformationResult {
  taskId: string;
  missingRequiredFields: DetectedField[];
  missingOptionalFields: DetectedField[];
  isReadyForReview: boolean;
}

/**
 * Approval & Review Snapshot
 */
export interface ApprovalSnapshot {
  taskId: string;
  version: number;
  webpageUrl: string;
  webpageTitle?: string | null;
  fields: DetectedField[];
}

export interface ApprovalRecord {
  id: string;
  userId: string;
  conversationId?: string | null;
  formTaskId?: string | null;
  approvalType: string;
  status: string;
  approvedAt?: string | null;
  taskVersion?: number | null;
  approvedSnapshot?: ApprovalSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskReviewResult {
  snapshot: ApprovalSnapshot;
  missing: MissingInformationResult;
  ready: boolean;
}

export interface TaskPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FormTaskListResponse {
  tasks: FormTask[];
  pagination: TaskPagination;
}

export interface FormTaskDetailResponse {
  task: FormTask;
  fields: DetectedField[];
  missingInformation: MissingInformationResult;
  approvals: ApprovalRecord[];
}

export interface CreateFormTaskRequest {
  conversationId: string;
  title?: string;
  taskType?: string;
  webpageUrl: string;
}

export interface CorrectFieldValueRequest {
  value: unknown;
  confidence?: number;
}

