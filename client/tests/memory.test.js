import test from 'node:test';
import assert from 'node:assert/strict';

import { memoryService } from '../src/features/memory/services/memory.service.ts';
import { apiClient } from '../src/services/api/api-client.ts';
import {
  MEMORY_CATEGORIES,
} from '../src/features/memory/types/memory.types.ts';

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

test.describe('Memory Categories & Contract Consistency', () => {
  test('matches all 10 Backend Phase 4 categories', () => {
    assert.deepEqual(MEMORY_CATEGORIES, [
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
    ]);
  });
});

test.describe('Multilingual and Unicode Script Preservation', () => {
  test('preserves Devanagari Hindi, Marathi, and Hinglish values verbatim', () => {
    const hindiMemory = {
      key: 'highest_qualification',
      value: 'बी.टेक संगणक विज्ञान और अभियांत्रिकी',
    };
    const marathiMemory = {
      key: 'current_city',
      value: 'पुणे, महाराष्ट्र',
    };
    const hinglishMemory = {
      key: 'preferred_mode',
      value: 'Mujhe daily email notifications chahiye',
    };

    assert.equal(hindiMemory.value, 'बी.टेक संगणक विज्ञान और अभियांत्रिकी');
    assert.equal(marathiMemory.value, 'पुणे, महाराष्ट्र');
    assert.equal(hinglishMemory.value, 'Mujhe daily email notifications chahiye');
  });
});

test.describe('Memory Service API Integration', () => {
  test('listApprovedMemories calls GET /api/v1/memories with query params', async () => {
    let capturedUrl = '';
    let capturedOptions = null;

    apiClient.get = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        data: {
          memories: [
            {
              id: 'mem-1',
              category: 'EDUCATION',
              key: 'degree',
              value: 'B.E. Computer Engineering',
              dataType: 'STRING',
              status: 'APPROVED',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      };
    };

    const result = await memoryService.listApprovedMemories({
      page: 1,
      limit: 20,
      category: 'EDUCATION',
      key: 'degree',
    });

    assert.equal(capturedUrl, '/api/v1/memories');
    assert.ok(capturedOptions?.params);
    assert.equal(capturedOptions.params.page, 1);
    assert.equal(capturedOptions.params.category, 'EDUCATION');
    assert.equal(capturedOptions.params.key, 'degree');
    assert.equal(result.memories.length, 1);
    assert.equal(result.memories[0].key, 'degree');
  });

  test('listProposals calls GET /api/v1/memories/proposals with status filter', async () => {
    let capturedUrl = '';
    let capturedOptions = null;

    apiClient.get = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        data: {
          proposals: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        },
      };
    };

    await memoryService.listProposals({ page: 2, limit: 10, status: 'PENDING' });

    assert.equal(capturedUrl, '/api/v1/memories/proposals');
    assert.ok(capturedOptions?.params);
    assert.equal(capturedOptions.params.page, 2);
    assert.equal(capturedOptions.params.limit, 10);
    assert.equal(capturedOptions.params.status, 'PENDING');
  });

  test('createProposal calls POST /api/v1/memories/proposals', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.post = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          proposal: {
            id: 'prop-create-1',
            userId: 'user-1',
            operation: 'CREATE',
            category: 'ADDRESS',
            proposedKey: 'city',
            proposedValue: 'Mumbai',
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    };

    const res = await memoryService.createProposal({
      operation: 'CREATE',
      category: 'ADDRESS',
      key: 'city',
      proposedValue: 'Mumbai',
    });

    assert.equal(capturedUrl, '/api/v1/memories/proposals');
    assert.equal(capturedBody.operation, 'CREATE');
    assert.equal(capturedBody.category, 'ADDRESS');
    assert.equal(capturedBody.key, 'city');
    assert.equal(capturedBody.proposedValue, 'Mumbai');
    assert.equal(res.id, 'prop-create-1');
  });

  test('approveProposal calls POST /api/v1/memories/proposals/:id/approve', async () => {
    let capturedUrl = '';

    apiClient.post = async (url) => {
      capturedUrl = url;
      return {
        data: {
          proposal: { id: 'prop-app-1', status: 'APPROVED' },
          memory: { id: 'mem-new-1', status: 'APPROVED' },
        },
      };
    };

    const res = await memoryService.approveProposal('prop-app-1');

    assert.equal(capturedUrl, '/api/v1/memories/proposals/prop-app-1/approve');
    assert.equal(res.proposal.status, 'APPROVED');
    assert.equal(res.memory?.id, 'mem-new-1');
  });

  test('rejectProposal calls POST /api/v1/memories/proposals/:id/reject with reason', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.post = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          proposal: {
            id: 'prop-rej-1',
            status: 'REJECTED',
            rejectionReason: 'Outdated information',
          },
        },
      };
    };

    const res = await memoryService.rejectProposal('prop-rej-1', {
      reason: 'Outdated information',
    });

    assert.equal(capturedUrl, '/api/v1/memories/proposals/prop-rej-1/reject');
    assert.deepEqual(capturedBody, { reason: 'Outdated information' });
    assert.equal(res.status, 'REJECTED');
    assert.equal(res.rejectionReason, 'Outdated information');
  });

  test('editMemory calls PATCH /api/v1/memories/:id and creates an UPDATE proposal', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.patch = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          proposal: {
            id: 'prop-upd-1',
            existingMemoryId: 'mem-to-edit',
            operation: 'UPDATE',
            proposedValue: 'M.E. Computer Engineering',
            status: 'PENDING',
          },
        },
      };
    };

    const res = await memoryService.editMemory('mem-to-edit', {
      proposedValue: 'M.E. Computer Engineering',
    });

    assert.equal(capturedUrl, '/api/v1/memories/mem-to-edit');
    assert.deepEqual(capturedBody, { proposedValue: 'M.E. Computer Engineering' });
    assert.equal(res.operation, 'UPDATE');
    assert.equal(res.status, 'PENDING');
  });

  test('deleteMemory calls DELETE /api/v1/memories/:id and creates a DELETE proposal', async () => {
    let capturedUrl = '';

    apiClient.delete = async (url) => {
      capturedUrl = url;
      return {
        data: {
          proposal: {
            id: 'prop-del-1',
            existingMemoryId: 'mem-to-delete',
            operation: 'DELETE',
            status: 'PENDING',
          },
        },
      };
    };

    const res = await memoryService.deleteMemory('mem-to-delete');

    assert.equal(capturedUrl, '/api/v1/memories/mem-to-delete');
    assert.equal(res.operation, 'DELETE');
    assert.equal(res.status, 'PENDING');
  });

  test('extractCandidates calls POST /api/v1/memories/extract', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.post = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          candidates: [
            {
              category: 'EDUCATION',
              key: 'highest_qualification',
              value: 'B.E. Computer Engineering',
              dataType: 'STRING',
              confidence: 'HIGH',
              sourceConversationId: 'conv-1',
              sourceMessageId: 'msg-1',
            },
          ],
        },
      };
    };

    const res = await memoryService.extractCandidates({
      conversationId: 'conv-1',
      messageId: 'msg-1',
    });

    assert.equal(capturedUrl, '/api/v1/memories/extract');
    assert.deepEqual(capturedBody, { conversationId: 'conv-1', messageId: 'msg-1' });
    assert.equal(res.length, 1);
    assert.equal(res[0].key, 'highest_qualification');
  });
});

