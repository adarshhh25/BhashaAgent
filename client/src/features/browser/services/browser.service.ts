/**
 * Browser Communication & Execution Service (Phase 9 Integration)
 *
 * Interacts with authoritative backend Phase 9 endpoints:
 * - POST /api/v1/browser/register
 * - POST /api/v1/browser/instructions
 * - POST /api/v1/browser/executions/:executionId/acknowledge
 * - POST /api/v1/browser/executions/:executionId/retry
 * - POST /api/v1/browser/executions/:executionId/cancel
 * - GET  /api/v1/browser/executions/:executionId
 * - GET  /api/v1/browser/tasks/:taskId/mappings
 */

import { apiClient } from '../../../services/api/api-client';
import type {
  BrowserPageSession,
  BrowserExecution,
  RegisterPageSessionRequest,
  FillInstructionRequest,
  FormFillAcknowledgementRequest,
  RetryExecutionRequest,
  CancelExecutionRequest,
} from '../types/browser.types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: unknown;
}

const API_PREFIX = '/api/v1/browser';

export const browserService = {
  /**
   * Register an authenticated browser page context and detected fields.
   */
  async registerPageSession(
    request: RegisterPageSessionRequest,
  ): Promise<BrowserPageSession> {
    const res = await apiClient.post<ApiResponse<{ pageSession: BrowserPageSession }>>(
      `${API_PREFIX}/register`,
      request,
    );
    return res.data.pageSession;
  },

  /**
   * Request authorized browser fill instructions for an approved task.
   */
  async issueInstructions(
    request: FillInstructionRequest,
  ): Promise<BrowserExecution> {
    const res = await apiClient.post<ApiResponse<{ execution: BrowserExecution }>>(
      `${API_PREFIX}/instructions`,
      request,
    );
    return res.data.execution;
  },

  /**
   * Submit execution acknowledgement with field results.
   */
  async acknowledgeExecution(
    executionId: string,
    request: FormFillAcknowledgementRequest,
  ): Promise<BrowserExecution> {
    const res = await apiClient.post<ApiResponse<{ execution: BrowserExecution }>>(
      `${API_PREFIX}/executions/${executionId}/acknowledge`,
      request,
    );
    return res.data.execution;
  },

  /**
   * Retry failed execution actions.
   */
  async retryExecution(
    executionId: string,
    request: RetryExecutionRequest,
  ): Promise<BrowserExecution> {
    const res = await apiClient.post<ApiResponse<{ execution: BrowserExecution }>>(
      `${API_PREFIX}/executions/${executionId}/retry`,
      request,
    );
    return res.data.execution;
  },

  /**
   * Cancel an in-progress or issued execution.
   */
  async cancelExecution(
    executionId: string,
    request: CancelExecutionRequest,
  ): Promise<BrowserExecution> {
    const res = await apiClient.post<ApiResponse<{ execution: BrowserExecution }>>(
      `${API_PREFIX}/executions/${executionId}/cancel`,
      request,
    );
    return res.data.execution;
  },

  /**
   * Fetch current status and results of an execution.
   */
  async getExecutionStatus(
    executionId: string,
  ): Promise<BrowserExecution> {
    const res = await apiClient.get<ApiResponse<{ execution: BrowserExecution }>>(
      `${API_PREFIX}/executions/${executionId}`,
    );
    return res.data.execution;
  },
};
