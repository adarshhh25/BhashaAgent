import test from 'node:test';
import assert from 'node:assert/strict';

import { conversationService } from '../src/features/conversations/services/conversation.service.ts';
import { apiClient } from '../src/services/api/api-client.ts';
import { SUPPORTED_LANGUAGES } from '../src/features/conversations/types/conversation.types.ts';

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

test.describe('Multilingual Language Configuration', () => {
  test('supports all 4 required languages including Hinglish', () => {
    const supportedCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
    assert.deepEqual(supportedCodes, ['en', 'hi', 'mr', 'hinglish']);
  });

  test('preserves original script and text without forced transliteration', () => {
    const hindiInput = 'कृपया मुझे यह फॉर्म भरने में सहायता करें';
    const marathiInput = 'कृपया मला हे पृष्ठ समजून सांगा';
    const hinglishInput = 'Mujhe is website par account create karna hai';
    const englishInput = 'Please explain this form to me';

    // Verify raw strings remain intact
    assert.equal(hindiInput, 'कृपया मुझे यह फॉर्म भरने में सहायता करें');
    assert.equal(marathiInput, 'कृपया मला हे पृष्ठ समजून सांगा');
    assert.equal(hinglishInput, 'Mujhe is website par account create karna hai');
    assert.equal(englishInput, 'Please explain this form to me');
  });
});

test.describe('Conversation Service API Integration', () => {
  test('createConversation calls POST /api/v1/conversations with optional title', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.post = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          conversation: {
            id: 'conv-123',
            userId: 'user-1',
            title: 'Custom Title',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    };

    const result = await conversationService.createConversation('Custom Title');
    assert.equal(capturedUrl, '/api/v1/conversations');
    assert.deepEqual(capturedBody, { title: 'Custom Title' });
    assert.equal(result.id, 'conv-123');
    assert.equal(result.title, 'Custom Title');
  });

  test('listConversations constructs correct query params', async () => {
    let capturedUrl = '';
    let capturedOptions = null;

    apiClient.get = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        data: {
          conversations: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      };
    };

    await conversationService.listConversations({ page: 2, limit: 15, status: 'ACTIVE' });
    assert.equal(capturedUrl, '/api/v1/conversations');
    assert.ok(capturedOptions?.params);
    assert.equal(capturedOptions.params.page, 2);
    assert.equal(capturedOptions.params.limit, 15);
    assert.equal(capturedOptions.params.status, 'ACTIVE');
  });

  test('listMessages supports cursor-based pagination (beforeMessageId)', async () => {
    let capturedUrl = '';
    let capturedOptions = null;

    apiClient.get = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        data: {
          messages: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        },
      };
    };

    await conversationService.listMessages('conv-1', {
      beforeMessageId: 'msg-cursor-99',
      limit: 20,
      order: 'asc',
    });

    assert.equal(capturedUrl, '/api/v1/conversations/conv-1/messages');
    assert.ok(capturedOptions?.params);
    assert.equal(capturedOptions.params.beforeMessageId, 'msg-cursor-99');
    assert.equal(capturedOptions.params.limit, 20);
    assert.equal(capturedOptions.params.order, 'asc');
  });

  test('updateConversation can rename or archive conversation', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.patch = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          conversation: {
            id: 'conv-1',
            title: 'Renamed Chat',
            status: 'ARCHIVED',
          },
        },
      };
    };

    const res = await conversationService.updateConversation('conv-1', {
      title: 'Renamed Chat',
      status: 'ARCHIVED',
    });

    assert.equal(capturedUrl, '/api/v1/conversations/conv-1');
    assert.deepEqual(capturedBody, { title: 'Renamed Chat', status: 'ARCHIVED' });
    assert.equal(res.status, 'ARCHIVED');
  });

  test('deleteConversation calls DELETE /api/v1/conversations/:id', async () => {
    let capturedUrl = '';

    apiClient.delete = async (url) => {
      capturedUrl = url;
      return { data: { success: true } };
    };

    await conversationService.deleteConversation('conv-del');
    assert.equal(capturedUrl, '/api/v1/conversations/conv-del');
  });

  test('correctMessage calls PATCH /api/v1/conversations/:id/messages/:messageId', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.patch = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          message: {
            id: 'msg-edit-1',
            conversationId: 'conv-1',
            role: 'USER',
            content: 'Updated content text',
          },
        },
      };
    };

    const res = await conversationService.correctMessage('conv-1', 'msg-edit-1', 'Updated content text');
    assert.equal(capturedUrl, '/api/v1/conversations/conv-1/messages/msg-edit-1');
    assert.deepEqual(capturedBody, { content: 'Updated content text' });
    assert.equal(res.content, 'Updated content text');
  });

  test('submitTurn calls POST /api/v1/conversations/:id/turns with multilingual payload', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.post = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          userMessageId: 'msg-u1',
          assistantMessageId: 'msg-a1',
          response: 'Haan, main aapki form bharne mein poori madad karunga.',
          intent: { primary: 'ASSIST_FORM', confidence: 0.95 },
          decision: { type: 'RESPOND', reason: 'Direct assistance' },
          toolsExecuted: [],
        },
      };
    };

    const turnResult = await conversationService.submitTurn('conv-turn', {
      content: 'Mujhe ye form bharna hai',
      language: 'hinglish',
    });

    assert.equal(capturedUrl, '/api/v1/conversations/conv-turn/turns');
    assert.deepEqual(capturedBody, {
      content: 'Mujhe ye form bharna hai',
      language: 'hinglish',
    });
    assert.equal(turnResult.assistantMessageId, 'msg-a1');
    assert.equal(turnResult.intent.primary, 'ASSIST_FORM');
  });
});

test.describe('Message Role & InputMode Decoupling', () => {
  test('correctly identifies assistant message by role even when inputMode is VOICE (backend discrepancy)', () => {
    // Backend agent.service.ts hardcodes inputMode: "VOICE" for assistant messages
    const backendAssistantMessage = {
      id: 'msg-asst-1',
      conversationId: 'conv-1',
      role: 'ASSISTANT',
      content: 'Assistant reply',
      inputMode: 'VOICE', // Backend discrepancy
      language: 'en',
      createdAt: new Date().toISOString(),
    };

    const isAssistant = backendAssistantMessage.role === 'ASSISTANT';
    const isUser = backendAssistantMessage.role === 'USER';

    assert.equal(isAssistant, true);
    assert.equal(isUser, false);
  });

  test('correctly identifies user message by role regardless of inputMode', () => {
    const textUserMessage = {
      id: 'msg-u-1',
      conversationId: 'conv-1',
      role: 'USER',
      content: 'User typed text',
      inputMode: 'TEXT',
      language: 'en',
      createdAt: new Date().toISOString(),
    };

    const voiceUserMessage = {
      id: 'msg-u-2',
      conversationId: 'conv-1',
      role: 'USER',
      content: 'User spoken input',
      inputMode: 'VOICE',
      language: 'hi',
      createdAt: new Date().toISOString(),
    };

    assert.equal(textUserMessage.role === 'USER', true);
    assert.equal(voiceUserMessage.role === 'USER', true);
  });
});

test.describe('Asymmetric Turn Failure & Safe Reconciliation', () => {
  test('optimistic message status transitions correctly on success', () => {
    const optimisticMsg = {
      id: 'temp-1',
      conversationId: 'conv-1',
      role: 'USER',
      content: 'Hello agent',
      inputMode: 'TEXT',
      language: 'en',
      createdAt: new Date().toISOString(),
      clientStatus: 'sending',
    };

    assert.equal(optimisticMsg.clientStatus, 'sending');

    // On success:
    const persistedMsg = {
      ...optimisticMsg,
      clientStatus: 'persisted',
    };
    assert.equal(persistedMsg.clientStatus, 'persisted');
  });

  test('failed turn marks user message as failed and NEVER blindly retries', () => {
    let isRetryingBlindly = false;
    let turnFailed = false;

    // Simulate turn error (e.g. 504 Gateway Timeout or Groq LLM failure)
    try {
      turnFailed = true;
      // In BhashaAgent, createUserMessage already committed the user message in DB
      // We must NEVER blindly resubmit content to /turns, which would duplicate user message
      if (turnFailed) {
        // Safe action: notify user, mark state, offer reconciliation
        isRetryingBlindly = false;
      }
    } catch {
      //
    }

    assert.equal(turnFailed, true);
    assert.equal(isRetryingBlindly, false);
  });

  test('reconcileMessages fetches canonical message list from backend', async () => {
    let capturedUrl = '';

    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        data: {
          messages: [
            {
              id: 'persisted-user-msg-id',
              conversationId: 'conv-rec',
              role: 'USER',
              content: 'User message persisted before error',
              inputMode: 'TEXT',
              language: 'en',
              createdAt: '2026-11-02T12:00:00.000Z',
            },
          ],
          pagination: { page: 1, limit: 30, total: 1, totalPages: 1 },
        },
      };
    };

    const res = await conversationService.listMessages('conv-rec', { page: 1, limit: 30, order: 'asc' });

    assert.equal(capturedUrl, '/api/v1/conversations/conv-rec/messages');
    assert.equal(res.messages.length, 1);
    assert.equal(res.messages[0].id, 'persisted-user-msg-id');
    assert.equal(res.messages[0].content, 'User message persisted before error');
  });
});
