/**
 * Browser Communication & Execution Types (Phase 9 Integration)
 *
 * Grounded in Backend Phase 9:
 * - server/src/modules/browser/browser.protocol.ts
 * - server/src/modules/browser/browser.types.ts
 * - server/prisma/schema.prisma
 */

export const BROWSER_PROTOCOL_VERSION = 'bhasha.browser.v1' as const;
export type BrowserProtocolVersion = typeof BROWSER_PROTOCOL_VERSION;

export const BROWSER_ACTION_TYPES = [
  'SET_VALUE',
  'SELECT_OPTION',
  'CHECK',
  'UNCHECK',
] as const;

export type BrowserActionType = (typeof BROWSER_ACTION_TYPES)[number];

export type BrowserExecutionStatus =
  | 'ISSUED'
  | 'IN_PROGRESS'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export type BrowserActionStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELLED';

export interface BrowserPageContext {
  url: string;
  title?: string;
  detectedAt: string;
  fingerprint?: string;
  tabId?: string;
}

export interface BrowserDetectedField {
  fieldIdentifier: string;
  fieldKey?: string;
  label: string;
  name?: string;
  elementType: string;
  inputType: string;
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  detectedOrder?: number;
  groupName?: string;
  sectionName?: string;
  detectionConfidence?: number;
  options?: Array<{
    value: string | number | boolean;
    label?: string;
  }>;
  fingerprint?: string;
}

export interface BrowserFillAction {
  fieldId: string;
  actionId: string;
  action: BrowserActionType;
  value: string | number | boolean | Array<string | number | boolean>;
  expectedFieldType: string;
  expectedFieldFingerprint?: string;
}

export interface BrowserFillInstruction {
  protocolVersion: BrowserProtocolVersion;
  type: 'FORM_FILL';
  actionId: string;
  idempotencyKey: string;
  taskId: string;
  approvalId: string;
  taskVersion: number;
  pageContext: BrowserPageContext;
  issuedAt: string;
  expiresAt: string;
  actions: BrowserFillAction[];
}

export interface BrowserActionResult {
  id: string;
  executionId: string;
  fieldId: string;
  actionId: string;
  status: BrowserActionStatus;
  errorCode?: string;
  message?: string;
  executedAt?: string;
}

export interface BrowserPageSession {
  id: string;
  userId: string;
  formTaskId: string;
  protocolVersion: string;
  pageUrl: string;
  origin: string;
  hostname: string;
  pageTitle?: string | null;
  fingerprint?: string | null;
  tabId?: string | null;
  idempotencyKey: string;
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserExecution {
  id: string;
  userId: string;
  formTaskId: string;
  pageSessionId: string;
  approvalId: string;
  protocolVersion: string;
  taskVersion: number;
  idempotencyKey: string;
  retryActionIds: string[];
  status: BrowserExecutionStatus;
  instruction: BrowserFillInstruction;
  expiresAt: string;
  cancelledAt?: string | null;
  acknowledgedAt?: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  results?: BrowserActionResult[];
}

/* ---------------------------------------------------------------------------
 * DTOs for Phase 9 API Requests
 * ---------------------------------------------------------------------------*/

export interface RegisterPageSessionRequest {
  protocolVersion: BrowserProtocolVersion;
  messageId: string;
  messageType: 'TASK_REGISTER';
  taskId: string;
  timestamp: string;
  idempotencyKey: string;
  payload: {
    pageContext: BrowserPageContext;
    fields: BrowserDetectedField[];
  };
}

export interface FillInstructionRequest {
  protocolVersion: BrowserProtocolVersion;
  messageId: string;
  messageType: 'FILL_INSTRUCTIONS_REQUEST';
  taskId: string;
  timestamp: string;
  idempotencyKey: string;
  pageSessionId: string;
}

export interface ActionResultItem {
  fieldId: string;
  actionId: string;
  actionType: BrowserActionType;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  errorCode?: string;
  message?: string;
  executedAt?: string;
}

export interface FormFillAcknowledgementRequest {
  protocolVersion: BrowserProtocolVersion;
  messageId: string;
  messageType: 'FORM_FILL_ACK';
  taskId: string;
  timestamp: string;
  idempotencyKey: string;
  executionId: string;
  actionId: string;
  pageSessionId: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  results: ActionResultItem[];
}

export interface RetryExecutionRequest {
  protocolVersion?: BrowserProtocolVersion;
  taskId: string;
  idempotencyKey: string;
  pageSessionId: string;
  actionIds?: string[];
}

export interface CancelExecutionRequest {
  taskId: string;
  idempotencyKey: string;
}

/* ---------------------------------------------------------------------------
 * Internal Extension Messaging Types
 * ---------------------------------------------------------------------------*/

export type BrowserExtensionMessageType =
  | 'GET_ACTIVE_TAB_CONTEXT'
  | 'DETECT_PAGE_FIELDS'
  | 'EXECUTE_FILL_INSTRUCTIONS';

export interface TabContextResponse {
  tabId?: number;
  url: string;
  title?: string;
}

export interface DetectPageFieldsResponse {
  pageContext: BrowserPageContext;
  fields: BrowserDetectedField[];
}

export interface ExecuteFillInstructionsResponse {
  overallStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  results: ActionResultItem[];
}

