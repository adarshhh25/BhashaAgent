/**
 * Conversation API Service
 *
 * Direct integration with Phase 3 (conversations) and Phase 7 (agent turns):
 * - POST   /api/v1/conversations
 * - GET    /api/v1/conversations
 * - GET    /api/v1/conversations/:id
 * - PATCH  /api/v1/conversations/:id
 * - DELETE /api/v1/conversations/:id
 * - GET    /api/v1/conversations/:id/messages
 * - PATCH  /api/v1/conversations/:id/messages/:messageId
 * - POST   /api/v1/conversations/:id/turns
 */

import { apiClient } from '../../../services/api/api-client';
import type {
  AgentTurnRequest,
  AgentTurnResponseData,
  Conversation,
  ConversationListResponse,
  Message,
  MessageListResponse,
  UpdateConversationRequest,
} from '../types/conversation.types';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const conversationService = {
  /**
   * List conversations for the authenticated user.
   */
  async listConversations(params?: {
    page?: number;
    limit?: number;
    status?: 'ACTIVE' | 'ARCHIVED';
  }): Promise<ConversationListResponse> {
    const res = await apiClient.get<ApiResponse<ConversationListResponse>>(
      '/api/v1/conversations',
      {
        params: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          status: params?.status,
        },
      },
    );
    return res.data;
  },

  /**
   * Create a new conversation.
   */
  async createConversation(title?: string): Promise<Conversation> {
    const res = await apiClient.post<ApiResponse<{ conversation: Conversation }>>(
      '/api/v1/conversations',
      title ? { title } : {},
    );
    return res.data.conversation;
  },

  /**
   * Retrieve a single conversation by ID.
   */
  async getConversation(id: string): Promise<Conversation> {
    const res = await apiClient.get<ApiResponse<{ conversation: Conversation }>>(
      `/api/v1/conversations/${id}`,
    );
    return res.data.conversation;
  },

  /**
   * Update a conversation (rename or change status between ACTIVE and ARCHIVED).
   */
  async updateConversation(
    id: string,
    data: UpdateConversationRequest,
  ): Promise<Conversation> {
    const res = await apiClient.patch<ApiResponse<{ conversation: Conversation }>>(
      `/api/v1/conversations/${id}`,
      data,
    );
    return res.data.conversation;
  },

  /**
   * Soft-delete a conversation.
   */
  async deleteConversation(id: string): Promise<void> {
    await apiClient.delete(`/api/v1/conversations/${id}`);
  },

  /**
   * List paginated messages in a conversation.
   */
  async listMessages(
    conversationId: string,
    params?: {
      page?: number;
      limit?: number;
      order?: 'asc' | 'desc';
      beforeMessageId?: string;
    },
    signal?: AbortSignal,
  ): Promise<MessageListResponse> {
    const res = await apiClient.get<ApiResponse<MessageListResponse>>(
      `/api/v1/conversations/${conversationId}/messages`,
      {
        params: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          order: params?.order ?? 'asc',
          beforeMessageId: params?.beforeMessageId,
        },
        signal,
      },
    );
    return res.data;
  },

  /**
   * Correct a previously submitted user message.
   */
  async correctMessage(
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<Message> {
    const res = await apiClient.patch<ApiResponse<{ message: Message }>>(
      `/api/v1/conversations/${conversationId}/messages/${messageId}`,
      { content },
    );
    return res.data.message;
  },

  /**
   * Submit a conversational agent turn (Phase 7 Orchestrator).
   */
  async submitTurn(
    conversationId: string,
    input: AgentTurnRequest,
    signal?: AbortSignal,
  ): Promise<AgentTurnResponseData> {
    const res = await apiClient.post<ApiResponse<AgentTurnResponseData>>(
      `/api/v1/conversations/${conversationId}/turns`,
      input,
      { signal },
    );
    return res.data;
  },
};

