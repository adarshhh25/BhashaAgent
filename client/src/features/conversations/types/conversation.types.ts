/**
 * Conversation & Agent Types
 *
 * Modeled directly from backend Phase 3 (conversations) and Phase 7 (agent orchestrator).
 */

export type ConversationStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';
export type MessageInputMode = 'TEXT' | 'VOICE';

export interface MessageRevision {
  id: string;
  previousContent: string;
  revisionNumber: number;
  revisedAt: string;
}

export interface MessageMetadata {
  intent?: string;
  decision?: string;
  source?: string;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  inputMode: MessageInputMode;
  language: string | null;
  metadata?: MessageMetadata | null;
  createdAt: string;
  revisions?: MessageRevision[];
  // Client-side optimistic status
  clientStatus?: 'sending' | 'persisted' | 'failed';
  errorText?: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  status: ConversationStatus;
  summary: string | null;
  startedAt: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  _count?: {
    messages: number;
  };
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  pagination: PaginationMetadata;
}

export interface MessageListResponse {
  messages: Message[];
  pagination: PaginationMetadata;
}

export interface CreateConversationRequest {
  title?: string;
}

export interface UpdateConversationRequest {
  title?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
}

export interface AgentTurnRequest {
  content: string;
  language?: string;
  formTaskId?: string;
}

export interface AgentTurnResponseData {
  response: string;
  assistantMessageId: string;
  intent: {
    primary: string;
    secondary: string[];
    confidence: number;
  };
  decision: {
    type: 'respond' | 'clarify' | 'tool';
    reason?: string;
  };
  context?: unknown;
  toolResults?: Array<{
    toolCallId: string;
    name: string;
    success: boolean;
    data?: unknown;
  }>;
}

export type SupportedLanguage = 'en' | 'hi' | 'mr' | 'hinglish';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  scriptLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', scriptLabel: 'English' },
  { code: 'hi', label: 'Hindi', scriptLabel: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', scriptLabel: 'मराठी' },
  { code: 'hinglish', label: 'Hinglish', scriptLabel: 'Hinglish' },
];

