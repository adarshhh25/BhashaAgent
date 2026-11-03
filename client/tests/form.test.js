import test from 'node:test';
import assert from 'node:assert/strict';

import { formService } from '../src/features/forms/services/form.service.ts';
import { apiClient } from '../src/services/api/api-client.ts';

// Save original apiClient methods to restore after tests
const originalGet = apiClient.get;
const originalPost = apiClient.post;
const originalPatch = apiClient.patch;
const originalDelete = apiClient.delete;

test.afterEach(() => {
  apiClient.get = originalGet;
  apiClient.post = originalPost;
  apiClient.patch = originalPatch;
  apiClient.delete = originalDelete;
});

test.describe('Form Intelligence Service Contract & Endpoint Verification', () => {
  test('listTasks constructs correct query parameters', async () => {
    let capturedUrl = '';
    let capturedOptions = null;
    apiClient.get = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        success: true,
        data: {
          items: [],
          pagination: { total: 0, page: 2, limit: 15, totalPages: 0, hasNext: false, hasPrev: true },
        },
      };
    };

    const res = await formService.listTasks({
      status: 'MAPPED',
      page: 2,
      limit: 15,
      conversationId: 'conv-123',
    });

    assert.equal(capturedUrl, '/api/v1/form-tasks');
    assert.deepEqual(capturedOptions?.params, {
      page: 2,
      limit: 15,
      status: 'MAPPED',
      conversationId: 'conv-123',
      search: undefined,
    });
    assert.equal(res.items.length, 0);
    assert.equal(res.pagination.page, 2);
  });

  test('createTask sends pageUrl and optional formSelector and conversationId', async () => {
    let capturedUrl = '';
    let capturedPayload = null;

    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        success: true,
        data: {
          task: {
            id: 'task-new',
            userId: 'user-1',
            status: 'INITIALIZED',
            pageUrl: 'https://careers.example.com/apply',
            formSelector: 'form#job-app',
            conversationId: 'conv-999',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    };

    const task = await formService.createTask({
      pageUrl: 'https://careers.example.com/apply',
      formSelector: 'form#job-app',
      conversationId: 'conv-999',
    });

    assert.equal(capturedUrl, '/api/v1/form-tasks');
    assert.deepEqual(capturedPayload, {
      pageUrl: 'https://careers.example.com/apply',
      formSelector: 'form#job-app',
      conversationId: 'conv-999',
    });
    assert.equal(task.id, 'task-new');
    assert.equal(task.status, 'INITIALIZED');
  });

  test('getTask retrieves full task detail with detectedFields and fieldValues', async () => {
    let capturedUrl = '';
    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        success: true,
        data: {
          task: {
            id: 'task-42',
            userId: 'user-1',
            status: 'MAPPED',
            pageUrl: 'https://service.gov.in/passport',
            version: 3,
            detectedFields: [
              { id: 'f-1', formTaskId: 'task-42', fieldName: 'full_name', isRequired: true },
            ],
            fieldValues: [
              { id: 'v-1', formTaskId: 'task-42', fieldId: 'f-1', value: 'राहुल शर्मा', status: 'PENDING_APPROVAL', source: 'approved_profile', confidence: 0.95 },
            ],
            approvals: [],
            taskEvents: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          missingInformation: {
            formTaskId: 'task-42',
            missingFields: [],
            hasRequiredMissing: false,
            totalMissing: 0,
          },
        },
      };
    };

    const detail = await formService.getTask('task-42');
    assert.equal(capturedUrl, '/api/v1/form-tasks/task-42');
    assert.equal(detail.task.id, 'task-42');
    assert.equal(detail.task.detectedFields.length, 1);
    assert.equal(detail.task.fieldValues[0].value, 'राहुल शर्मा');
  });

  test('runIntelligentMapping hits the Phase 8 intelligent-mapping endpoint', async () => {
    let capturedUrl = '';
    apiClient.post = async (url) => {
      capturedUrl = url;
      return {
        success: true,
        data: {
          taskId: 'task-42',
          status: 'MAPPED',
          summary: { total: 4, mapped: 3, unmapped: 1, conflicts: 0 },
          fields: [
            { fieldId: 'f-1', name: 'name', status: 'mapped', proposedValue: 'Amit Kumar', source: 'approved_profile', confidence: 0.95 },
            { fieldId: 'f-2', name: 'email', status: 'mapped', proposedValue: 'amit@example.com', source: 'approved_profile', confidence: 0.98 },
            { fieldId: 'f-3', name: 'phone', status: 'unmapped', proposedValue: null, source: null, confidence: 0 },
            { fieldId: 'f-4', name: 'city', status: 'mapped', proposedValue: 'पुणे', source: 'conversation_answer', confidence: 0.85 },
          ],
        },
      };
    };

    const mapping = await formService.runIntelligentMapping('task-42');
    assert.equal(capturedUrl, '/api/v1/form-tasks/task-42/intelligent-mapping');
    assert.equal(mapping.taskId, 'task-42');
    assert.equal(mapping.summary.mapped, 3);
    assert.equal(mapping.fields.length, 4);
  });

  test('correctFieldValue sends value payload to field correction endpoint', async () => {
    let capturedUrl = '';
    let capturedPayload = null;

    apiClient.patch = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        success: true,
        data: {
          value: {
            id: 'v-1',
            formTaskId: 'task-42',
            fieldId: 'f-1',
            value: 'सचिन तेंडुलकर',
            status: 'USER_CORRECTED',
            source: 'USER_CORRECTED',
            confidence: 1.0,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    };

    const result = await formService.correctFieldValue('task-42', 'f-1', { value: 'सचिन तेंडुलकर' });
    assert.equal(capturedUrl, '/api/v1/form-tasks/task-42/fields/f-1/correct');
    assert.deepEqual(capturedPayload, { value: 'सचिन तेंडुलकर' });
    assert.equal(result.status, 'USER_CORRECTED');
    assert.equal(result.source, 'USER_CORRECTED');
    assert.equal(result.confidence, 1.0);
  });

  test('approveFieldValue and rejectFieldValue send requests to correct endpoints', async () => {
    let approvedUrl = '';
    let rejectedUrl = '';

    apiClient.post = async (url) => {
      if (url.includes('/approve')) {
        approvedUrl = url;
        return {
          success: true,
          data: {
            value: { id: 'v-1', status: 'APPROVED' },
          },
        };
      }
      if (url.includes('/reject')) {
        rejectedUrl = url;
        return {
          success: true,
          data: {
            value: { id: 'v-2', status: 'REJECTED' },
          },
        };
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const approveRes = await formService.approveFieldValue('task-42', 'f-1');
    assert.equal(approvedUrl, '/api/v1/form-tasks/task-42/fields/f-1/approve');
    assert.equal(approveRes.status, 'APPROVED');

    const rejectRes = await formService.rejectFieldValue('task-42', 'f-2');
    assert.equal(rejectedUrl, '/api/v1/form-tasks/task-42/fields/f-2/reject');
    assert.equal(rejectRes.status, 'REJECTED');
  });

  test('getMissingInformation identifies required vs optional unmapped fields', async () => {
    let capturedUrl = '';
    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        success: true,
        data: {
          formTaskId: 'task-42',
          missingFields: [
            { fieldId: 'f-3', fieldName: 'passport_number', isRequired: true, fieldType: 'text' },
            { fieldId: 'f-5', fieldName: 'alternate_email', isRequired: false, fieldType: 'email' },
          ],
          hasRequiredMissing: true,
          totalMissing: 2,
        },
      };
    };

    const missing = await formService.getMissingInformation('task-42');
    assert.equal(capturedUrl, '/api/v1/form-tasks/task-42/missing-information');
    assert.equal(missing.hasRequiredMissing, true);
    assert.equal(missing.missingFields.length, 2);
    assert.equal(missing.missingFields[0].isRequired, true);
    assert.equal(missing.missingFields[1].isRequired, false);
  });

  test('getReview returns snapshot, missing counts, and ready boolean', async () => {
    let capturedUrl = '';
    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        success: true,
        data: {
          ready: true,
          snapshot: {
            task: { id: 'task-42', status: 'REVIEW_READY', pageUrl: 'https://example.com/apply', version: 4 },
            fields: [
              {
                fieldId: 'f-1',
                fieldName: 'full_name',
                label: 'Full Name',
                isRequired: true,
                value: 'राजेश खन्ना',
                status: 'APPROVED',
                source: 'approved_profile',
                confidence: 0.95,
              },
            ],
            missingCount: 0,
            approvedCount: 1,
            unapprovedCount: 0,
            generatedAt: new Date().toISOString(),
          },
          missing: {
            isReadyForReview: true,
            missingFields: [],
            unresolvedValues: [],
          },
        },
      };
    };

    const review = await formService.getReview('task-42');
    assert.equal(capturedUrl, '/api/v1/form-tasks/task-42/review');
    assert.equal(review.ready, true);
    assert.equal(review.snapshot.approvedCount, 1);
    assert.equal(review.snapshot.missingCount, 0);
  });

  test('finalApprove sends expectedVersion and returns created Approval record', async () => {
    let capturedUrl = '';
    let capturedPayload = null;

    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        success: true,
        data: {
          task: {
            id: 'task-42',
            status: 'APPROVED_FOR_FILLING',
            version: 5,
          },
          approval: {
            id: 'appr-101',
            formTaskId: 'task-42',
            userId: 'user-1',
            version: 4,
            snapshot: { approved: true },
            createdAt: new Date().toISOString(),
          },
        },
      };
    };

    const approval = await formService.finalApprove('task-42', 4);
    assert.equal(capturedUrl, '/api/v1/form-tasks/task-42/final-approval');
    assert.deepEqual(capturedPayload, { expectedVersion: 4 });
    assert.equal(approval.id, 'appr-101');
    assert.equal(approval.formTaskId, 'task-42');
    assert.equal(approval.version, 4);
  });

  test('lifecycle controls: pauseTask, resumeTask, cancelTask, deleteTask', async () => {
    const executedEndpoints = [];

    apiClient.post = async (url) => {
      executedEndpoints.push(url);
      return { success: true, data: { task: { id: 'task-42' } } };
    };
    apiClient.delete = async (url) => {
      executedEndpoints.push(url);
      return { success: true, data: { task: { id: 'task-42' } } };
    };

    await formService.pauseTask('task-42');
    await formService.resumeTask('task-42');
    await formService.cancelTask('task-42');
    await formService.deleteTask('task-42');

    assert.deepEqual(executedEndpoints, [
      '/api/v1/form-tasks/task-42/pause',
      '/api/v1/form-tasks/task-42/resume',
      '/api/v1/form-tasks/task-42/cancel',
      '/api/v1/form-tasks/task-42',
    ]);
  });
});

test.describe('Multilingual and Unicode Script Preservation in Form Intelligence', () => {
  test('preserves Hindi, Marathi, and Hinglish field values verbatim without transformation', async () => {
    const hindiInput = 'अनिल प्रभाकर';
    const marathiAddress = 'फ्लॅट क्र. ४०२, गोखले नगर, पुणे - ४११०१६';
    const hinglishDesignation = 'Senior Software Engineer aur Team Lead';

    let submittedValue = '';
    apiClient.patch = async (url, payload) => {
      submittedValue = payload.value;
      return {
        success: true,
        data: {
          value: { id: 'v-1', value: payload.value, status: 'USER_CORRECTED', source: 'USER_CORRECTED', confidence: 1.0 },
        },
      };
    };

    // Hindi test
    const r1 = await formService.correctFieldValue('task-1', 'f-1', { value: hindiInput });
    assert.equal(submittedValue, hindiInput);
    assert.equal(r1.value, hindiInput);

    // Marathi test
    const r2 = await formService.correctFieldValue('task-1', 'f-2', { value: marathiAddress });
    assert.equal(submittedValue, marathiAddress);
    assert.equal(r2.value, marathiAddress);

    // Hinglish test
    const r3 = await formService.correctFieldValue('task-1', 'f-3', { value: hinglishDesignation });
    assert.equal(submittedValue, hinglishDesignation);
    assert.equal(r3.value, hinglishDesignation);
  });
});

test.describe('Human-in-the-Loop Review & Safety Verification', () => {
  test('rejects final approval when review indicates task is not ready', async () => {
    apiClient.get = async () => ({
      success: true,
      data: {
        ready: false,
        missing: {
          isReadyForReview: false,
          missingFields: [{ fieldId: 'f-9', fieldName: 'income', isRequired: true }],
          unresolvedValues: [],
        },
        snapshot: {
          task: { id: 'task-77', status: 'MAPPED', version: 1 },
          fields: [],
          missingCount: 1,
          approvedCount: 0,
          unapprovedCount: 1,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    const review = await formService.getReview('task-77');
    assert.equal(review.ready, false);
    assert.equal(review.missing.isReadyForReview, false);
    assert.equal(review.missing.missingFields.length, 1);
  });

  test('version concurrency guard protects against concurrent modifications', async () => {
    let callCount = 0;
    apiClient.post = async (url, payload) => {
      callCount++;
      if (payload.expectedVersion !== 3) {
        throw new Error('VERSION_CONFLICT: Task version has changed');
      }
      return {
        success: true,
        data: {
          approval: { id: 'appr-2', version: 3, formTaskId: 'task-88' },
        },
      };
    };

    // Correct version succeeds
    const successResult = await formService.finalApprove('task-88', 3);
    assert.equal(successResult.id, 'appr-2');
    assert.equal(successResult.version, 3);

    // Stale version throws version conflict
    await assert.rejects(
      async () => {
        await formService.finalApprove('task-88', 2);
      },
      {
        message: /VERSION_CONFLICT/,
      }
    );

    assert.equal(callCount, 2);
  });
});
