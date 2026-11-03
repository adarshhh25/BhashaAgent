/**
 * Profile Memory API Service
 *
 * Direct integration with Backend Phase 4:
 * - GET    /api/v1/memories
 * - GET    /api/v1/memories/proposals
 * - POST   /api/v1/memories/proposals
 * - POST   /api/v1/memories/proposals/:id/approve
 * - POST   /api/v1/memories/proposals/:id/reject
 * - PATCH  /api/v1/memories/:id
 * - DELETE /api/v1/memories/:id
 * - POST   /api/v1/memories/extract
 */

import { apiClient } from '../../../services/api/api-client';
import type {
  CreateProposalRequest,
  ExtractCandidatesRequest,
  MemoryCandidate,
  MemoryCategory,
  MemoryListResponse,
  MemoryProposal,
  ProfileMemory,
  ProposalListResponse,
  RejectProposalRequest,
  UpdateMemoryRequest,
} from '../types/memory.types';

const API_PREFIX = '/api/v1/memories';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const memoryService = {
  /**
   * Retrieve paginated approved profile memories.
   */
  async listApprovedMemories(params?: {
    page?: number;
    limit?: number;
    category?: MemoryCategory;
    key?: string;
  }): Promise<MemoryListResponse> {
    const res = await apiClient.get<ApiResponse<MemoryListResponse>>(API_PREFIX, {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        category: params?.category,
        key: params?.key,
      },
    });
    return res.data;
  },

  /**
   * Retrieve paginated memory proposals (pending, approved, or rejected).
   */
  async listProposals(params?: {
    page?: number;
    limit?: number;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  }): Promise<ProposalListResponse> {
    const res = await apiClient.get<ApiResponse<ProposalListResponse>>(`${API_PREFIX}/proposals`, {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        status: params?.status ?? 'PENDING',
      },
    });
    return res.data;
  },

  /**
   * Manually create a memory proposal.
   */
  async createProposal(input: CreateProposalRequest): Promise<MemoryProposal> {
    const res = await apiClient.post<ApiResponse<{ proposal: MemoryProposal }>>(
      `${API_PREFIX}/proposals`,
      input,
    );
    return res.data.proposal;
  },

  /**
   * Approve a pending memory change proposal.
   */
  async approveProposal(
    proposalId: string,
  ): Promise<{ proposal: MemoryProposal; memory?: ProfileMemory }> {
    const res = await apiClient.post<
      ApiResponse<{ proposal: MemoryProposal; memory?: ProfileMemory }>
    >(`${API_PREFIX}/proposals/${proposalId}/approve`, {});
    return res.data;
  },

  /**
   * Reject a pending memory change proposal.
   */
  async rejectProposal(
    proposalId: string,
    input?: RejectProposalRequest,
  ): Promise<MemoryProposal> {
    const res = await apiClient.post<ApiResponse<{ proposal: MemoryProposal }>>(
      `${API_PREFIX}/proposals/${proposalId}/reject`,
      input ?? {},
    );
    return res.data.proposal;
  },

  /**
   * Edit an approved memory (creates an UPDATE proposal).
   */
  async editMemory(
    memoryId: string,
    input: UpdateMemoryRequest,
  ): Promise<MemoryProposal> {
    const res = await apiClient.patch<ApiResponse<{ proposal: MemoryProposal }>>(
      `${API_PREFIX}/${memoryId}`,
      input,
    );
    return res.data.proposal;
  },

  /**
   * Delete an approved memory (creates a DELETE proposal).
   */
  async deleteMemory(memoryId: string): Promise<MemoryProposal> {
    const res = await apiClient.delete<ApiResponse<{ proposal: MemoryProposal }>>(
      `${API_PREFIX}/${memoryId}`,
    );
    return res.data.proposal;
  },

  /**
   * Extract memory candidates from a conversation message.
   */
  async extractCandidates(
    input: ExtractCandidatesRequest,
  ): Promise<MemoryCandidate[]> {
    const res = await apiClient.post<ApiResponse<{ candidates: MemoryCandidate[] }>>(
      `${API_PREFIX}/extract`,
      input,
    );
    return res.data.candidates;
  },
};

