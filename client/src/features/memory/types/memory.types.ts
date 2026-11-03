/**
 * Profile Memory Types & Enums
 *
 * Derived strictly from Backend Phase 4:
 * - server/prisma/schema.prisma
 * - server/src/modules/memories/memory.types.ts
 * - server/src/modules/memories/memory.validator.ts
 */

export const MEMORY_CATEGORIES = [
  'PERSONAL',
  'CONTACT',
  'ADDRESS',
  'EDUCATION',
  'EXPERIENCE',
  'SKILLS',
  'CERTIFICATIONS',
  'PREFERENCES',
  'LANGUAGE',
  'OTHER',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryChangeOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export type MemoryApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ProfileMemoryStatus = 'APPROVED' | 'DELETED';

export type MemoryDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'OBJECT' | 'ARRAY';

export type MemoryValue = string | number | boolean | Record<string, unknown> | unknown[];

/**
 * Approved Profile Memory Record
 */
export interface ProfileMemory {
  id: string;
  category: MemoryCategory;
  key: string;
  value: MemoryValue;
  dataType: MemoryDataType;
  status: ProfileMemoryStatus;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Memory Change Request / Proposal
 */
export interface MemoryProposal {
  id: string;
  userId: string;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  existingMemoryId?: string | null;
  operation: MemoryChangeOperation;
  category: MemoryCategory;
  proposedKey: string;
  proposedValue: MemoryValue;
  previousValue?: MemoryValue | null;
  status: MemoryApprovalStatus;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Extracted Memory Candidate
 */
export interface MemoryCandidate {
  category: MemoryCategory;
  key: string;
  value: MemoryValue;
  dataType: MemoryDataType;
  confidence: 'HIGH' | 'LOW';
  sourceConversationId: string;
  sourceMessageId: string;
}

/**
 * Standard Pagination Metadata
 */
export interface MemoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * List Responses
 */
export interface MemoryListResponse {
  memories: ProfileMemory[];
  pagination: MemoryPagination;
}

export interface ProposalListResponse {
  proposals: MemoryProposal[];
  pagination: MemoryPagination;
}

/**
 * Request Payloads
 */
export interface CreateProposalRequest {
  operation: MemoryChangeOperation;
  category: MemoryCategory;
  key: string;
  proposedValue: MemoryValue;
  sourceConversationId?: string;
  sourceMessageId?: string;
  existingMemoryId?: string;
}

export interface UpdateMemoryRequest {
  proposedValue: MemoryValue;
  category?: MemoryCategory;
  key?: string;
}

export interface RejectProposalRequest {
  reason?: string;
}

export interface ExtractCandidatesRequest {
  conversationId: string;
  messageId: string;
}

