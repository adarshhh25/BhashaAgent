/**
 * Voice API Service (Phase 10 Backend Integration)
 *
 * Interacts with:
 * - POST /api/v1/voice/tickets (Issues single-use ticket for authenticated voice session)
 */

import { apiClient } from '../../../services/api/api-client';
import type { VoiceTicket } from '../types/voice.types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: unknown;
}

export const voiceService = {
  /**
   * Request a single-use voice session ticket for active conversation.
   */
  async createVoiceTicket(conversationId: string, formTaskId?: string, language?: string): Promise<VoiceTicket> {
    const res = await apiClient.post<ApiResponse<{ voice: VoiceTicket }>>(
      '/api/v1/voice/tickets',
      {
        conversationId,
        ...(formTaskId ? { formTaskId } : {}),
        ...(language ? { language } : {}),
      },
    );
    return res.data.voice;
  },
};
