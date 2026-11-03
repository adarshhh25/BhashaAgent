/**
 * Form Intelligence API Service
 *
 * Direct integration with Backend Phase 5 & Phase 8:
 * - GET    /api/v1/form-tasks
 * - POST   /api/v1/form-tasks
 * - GET    /api/v1/form-tasks/:id
 * - PATCH  /api/v1/form-tasks/:id
 * - GET    /api/v1/form-tasks/:id/fields
 * - POST   /api/v1/form-tasks/:id/intelligent-mapping
 * - PATCH  /api/v1/form-tasks/:id/fields/:fieldId/correct
 * - POST   /api/v1/form-tasks/:id/fields/:fieldId/approve
 * - POST   /api/v1/form-tasks/:id/fields/:fieldId/reject
 * - GET    /api/v1/form-tasks/:id/missing-information
 * - GET    /api/v1/form-tasks/:id/review
 * - POST   /api/v1/form-tasks/:id/final-approval
 * - POST   /api/v1/form-tasks/:id/pause
 * - POST   /api/v1/form-tasks/:id/resume
 * - POST   /api/v1/form-tasks/:id/cancel
 * - DELETE /api/v1/form-tasks/:id
 */

import { apiClient } from '../../../services/api/api-client';
import type {
  ApprovalRecord,
  CorrectFieldValueRequest,
  CreateFormTaskRequest,
  DetectedField,
  FieldValue,
  FormIntelligenceResult,
  FormTask,
  FormTaskDetailResponse,
  FormTaskListResponse,
  MissingInformationResult,
  TaskReviewResult,
} from '../types/form.types';

const API_PREFIX = '/api/v1/form-tasks';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const formService = {
  /**
   * List form tasks for authenticated user.
   */
  async listTasks(params?: {
    page?: number;
    limit?: number;
    status?: string;
    conversationId?: string;
    search?: string;
  }): Promise<FormTaskListResponse> {
    const res = await apiClient.get<ApiResponse<FormTaskListResponse>>(API_PREFIX, {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        status: params?.status,
        conversationId: params?.conversationId,
        search: params?.search,
      },
    });
    return res.data;
  },

  /**
   * Create a new form task.
   */
  async createTask(input: CreateFormTaskRequest): Promise<FormTask> {
    const res = await apiClient.post<ApiResponse<{ task: FormTask }>>(API_PREFIX, input);
    return res.data.task;
  },

  /**
   * Retrieve full form task detail (task, fields, missing info, approvals).
   */
  async getTask(id: string): Promise<FormTaskDetailResponse> {
    const res = await apiClient.get<ApiResponse<FormTaskDetailResponse>>(`${API_PREFIX}/${id}`);
    return res.data;
  },

  /**
   * Update form task metadata or title.
   */
  async updateTask(
    id: string,
    data: { title?: string; taskMetadata?: Record<string, unknown> },
  ): Promise<FormTask> {
    const res = await apiClient.patch<ApiResponse<{ task: FormTask }>>(`${API_PREFIX}/${id}`, data);
    return res.data.task;
  },

  /**
   * List detected fields for a form task.
   */
  async listFields(taskId: string): Promise<DetectedField[]> {
    const res = await apiClient.get<ApiResponse<{ fields: DetectedField[] }>>(
      `${API_PREFIX}/${taskId}/fields`,
    );
    return res.data.fields;
  },

  /**
   * Run Phase 8 Intelligent Mapping on form task.
   */
  async runIntelligentMapping(
    taskId: string,
    expectedVersion?: number,
  ): Promise<FormIntelligenceResult> {
    const res = await apiClient.post<ApiResponse<FormIntelligenceResult>>(
      `${API_PREFIX}/${taskId}/intelligent-mapping`,
      expectedVersion !== undefined ? { expectedVersion } : {},
    );
    return res.data;
  },

  /**
   * Correct a field value (sets source to USER_CORRECTED).
   */
  async correctFieldValue(
    taskId: string,
    fieldId: string,
    input: CorrectFieldValueRequest,
  ): Promise<FieldValue> {
    const res = await apiClient.patch<ApiResponse<{ value: FieldValue }>>(
      `${API_PREFIX}/${taskId}/fields/${fieldId}/correct`,
      input,
    );
    return res.data.value;
  },

  /**
   * Approve a field value.
   */
  async approveFieldValue(taskId: string, fieldId: string): Promise<FieldValue> {
    const res = await apiClient.post<ApiResponse<{ value: FieldValue }>>(
      `${API_PREFIX}/${taskId}/fields/${fieldId}/approve`,
      {},
    );
    return res.data.value;
  },

  /**
   * Reject a field value.
   */
  async rejectFieldValue(taskId: string, fieldId: string): Promise<FieldValue> {
    const res = await apiClient.post<ApiResponse<{ value: FieldValue }>>(
      `${API_PREFIX}/${taskId}/fields/${fieldId}/reject`,
      {},
    );
    return res.data.value;
  },

  /**
   * Retrieve missing information analysis.
   */
  async getMissingInformation(taskId: string): Promise<MissingInformationResult> {
    const res = await apiClient.get<ApiResponse<MissingInformationResult>>(
      `${API_PREFIX}/${taskId}/missing-information`,
    );
    return res.data;
  },

  /**
   * Retrieve approval review snapshot and readiness status.
   */
  async getReview(taskId: string): Promise<TaskReviewResult> {
    const res = await apiClient.get<ApiResponse<TaskReviewResult>>(`${API_PREFIX}/${taskId}/review`);
    return res.data;
  },

  /**
   * Grant final approval for form filling.
   */
  async finalApprove(taskId: string, expectedVersion: number): Promise<ApprovalRecord> {
    const res = await apiClient.post<ApiResponse<{ approval: ApprovalRecord }>>(
      `${API_PREFIX}/${taskId}/final-approval`,
      { expectedVersion },
    );
    return res.data.approval;
  },

  /**
   * Pause form task.
   */
  async pauseTask(taskId: string, expectedVersion?: number): Promise<FormTask> {
    const res = await apiClient.post<ApiResponse<{ task: FormTask }>>(
      `${API_PREFIX}/${taskId}/pause`,
      expectedVersion !== undefined ? { expectedVersion } : {},
    );
    return res.data.task;
  },

  /**
   * Resume form task.
   */
  async resumeTask(taskId: string, expectedVersion?: number): Promise<FormTask> {
    const res = await apiClient.post<ApiResponse<{ task: FormTask }>>(
      `${API_PREFIX}/${taskId}/resume`,
      expectedVersion !== undefined ? { expectedVersion } : {},
    );
    return res.data.task;
  },

  /**
   * Cancel form task.
   */
  async cancelTask(taskId: string, expectedVersion?: number): Promise<FormTask> {
    const res = await apiClient.post<ApiResponse<{ task: FormTask }>>(
      `${API_PREFIX}/${taskId}/cancel`,
      expectedVersion !== undefined ? { expectedVersion } : {},
    );
    return res.data.task;
  },

  /**
   * Delete form task.
   */
  async deleteTask(taskId: string): Promise<FormTask> {
    const res = await apiClient.delete<ApiResponse<{ task: FormTask }>>(`${API_PREFIX}/${taskId}`);
    return res.data.task;
  },
};

