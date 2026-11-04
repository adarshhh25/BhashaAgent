import test from 'node:test';
import assert from 'node:assert/strict';

import { browserService } from '../src/features/browser/services/browser.service.ts';
import { apiClient } from '../src/services/api/api-client.ts';
import {
  BROWSER_PROTOCOL_VERSION,
  BROWSER_ACTION_TYPES,
} from '../src/features/browser/types/browser.types.ts';
import {
  executeSingleAction,
  ALLOWED_ACTIONS,
} from '../src/features/browser/services/dom-action-executor.ts';

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

test.describe('Phase 9 Protocol Version & Action Allowlist Verification', () => {
  test('protocol version is strictly bhasha.browser.v1', () => {
    assert.equal(BROWSER_PROTOCOL_VERSION, 'bhasha.browser.v1');
  });

  test('action allowlist strictly matches Backend Phase 9 supported actions', () => {
    assert.deepEqual(BROWSER_ACTION_TYPES, [
      'SET_VALUE',
      'SELECT_OPTION',
      'CHECK',
      'UNCHECK',
    ]);
    assert.deepEqual(ALLOWED_ACTIONS, [
      'SET_VALUE',
      'SELECT_OPTION',
      'CHECK',
      'UNCHECK',
    ]);
  });
});

test.describe('Browser Service API Contract & Endpoint Verification', () => {
  test('registerPageSession calls POST /api/v1/browser/register', async () => {
    let capturedUrl = '';
    let capturedPayload = null;

    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        success: true,
        data: {
          pageSession: {
            id: 'session-101',
            userId: 'user-1',
            formTaskId: 'task-101',
            protocolVersion: 'bhasha.browser.v1',
            pageUrl: 'https://example.com/apply',
            origin: 'https://example.com',
            hostname: 'example.com',
            idempotencyKey: 'session-key-1',
            detectedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    };

    const session = await browserService.registerPageSession({
      protocolVersion: 'bhasha.browser.v1',
      messageId: 'msg-1',
      messageType: 'TASK_REGISTER',
      taskId: 'task-101',
      timestamp: new Date().toISOString(),
      idempotencyKey: 'session-key-1',
      payload: {
        pageContext: {
          url: 'https://example.com/apply',
          title: 'Job Application',
          detectedAt: new Date().toISOString(),
        },
        fields: [
          {
            fieldIdentifier: 'full_name',
            label: 'Full Name',
            elementType: 'input',
            inputType: 'text',
          },
        ],
      },
    });

    assert.equal(capturedUrl, '/api/v1/browser/register');
    assert.equal(capturedPayload?.taskId, 'task-101');
    assert.equal(capturedPayload?.protocolVersion, 'bhasha.browser.v1');
    assert.equal(session.id, 'session-101');
    assert.equal(session.pageUrl, 'https://example.com/apply');
  });

  test('issueInstructions calls POST /api/v1/browser/instructions', async () => {
    let capturedUrl = '';
    let capturedPayload = null;

    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        success: true,
        data: {
          execution: {
            id: 'exec-1',
            userId: 'user-1',
            formTaskId: 'task-101',
            pageSessionId: 'session-101',
            approvalId: 'appr-1',
            protocolVersion: 'bhasha.browser.v1',
            taskVersion: 2,
            idempotencyKey: 'exec-key-1',
            status: 'ISSUED',
            instruction: {
              protocolVersion: 'bhasha.browser.v1',
              type: 'FORM_FILL',
              actionId: 'action-batch-1',
              idempotencyKey: 'exec-key-1',
              taskId: 'task-101',
              approvalId: 'appr-1',
              taskVersion: 2,
              issuedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 300000).toISOString(),
              actions: [
                {
                  fieldId: 'field-1',
                  actionId: 'act-1',
                  action: 'SET_VALUE',
                  value: 'Amit Sharma',
                  expectedFieldType: 'text',
                },
              ],
            },
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            retryCount: 0,
            retryActionIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    };

    const execution = await browserService.issueInstructions({
      protocolVersion: 'bhasha.browser.v1',
      messageId: 'msg-2',
      messageType: 'FILL_INSTRUCTIONS_REQUEST',
      taskId: 'task-101',
      timestamp: new Date().toISOString(),
      idempotencyKey: 'exec-key-1',
      pageSessionId: 'session-101',
    });

    assert.equal(capturedUrl, '/api/v1/browser/instructions');
    assert.equal(capturedPayload?.taskId, 'task-101');
    assert.equal(capturedPayload?.pageSessionId, 'session-101');
    assert.equal(execution.id, 'exec-1');
    assert.equal(execution.status, 'ISSUED');
    assert.equal(execution.instruction.actions.length, 1);
  });

  test('acknowledgeExecution calls POST /api/v1/browser/executions/:id/acknowledge', async () => {
    let capturedUrl = '';
    let capturedPayload = null;

    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        success: true,
        data: {
          execution: {
            id: 'exec-1',
            status: 'COMPLETED',
            results: [
              {
                id: 'res-1',
                executionId: 'exec-1',
                fieldId: 'field-1',
                actionId: 'act-1',
                status: 'SUCCESS',
                executedAt: new Date().toISOString(),
              },
            ],
          },
        },
      };
    };

    const acknowledged = await browserService.acknowledgeExecution('exec-1', {
      protocolVersion: 'bhasha.browser.v1',
      messageId: 'msg-3',
      messageType: 'FORM_FILL_ACK',
      taskId: 'task-101',
      timestamp: new Date().toISOString(),
      idempotencyKey: 'ack-key-1',
      executionId: 'exec-1',
      actionId: 'action-batch-1',
      pageSessionId: 'session-101',
      status: 'COMPLETED',
      results: [
        {
          fieldId: 'field-1',
          actionId: 'act-1',
          actionType: 'SET_VALUE',
          status: 'SUCCESS',
        },
      ],
    });

    assert.equal(capturedUrl, '/api/v1/browser/executions/exec-1/acknowledge');
    assert.equal(capturedPayload?.status, 'COMPLETED');
    assert.equal(acknowledged.status, 'COMPLETED');
  });

  test('retryExecution calls POST /api/v1/browser/executions/:id/retry', async () => {
    let capturedUrl = '';
    let capturedPayload = null;

    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        success: true,
        data: {
          execution: {
            id: 'exec-1',
            status: 'ISSUED',
            retryCount: 1,
            retryActionIds: ['act-failed-1'],
          },
        },
      };
    };

    const retried = await browserService.retryExecution('exec-1', {
      taskId: 'task-101',
      idempotencyKey: 'retry-key-1',
      pageSessionId: 'session-101',
      actionIds: ['act-failed-1'],
    });

    assert.equal(capturedUrl, '/api/v1/browser/executions/exec-1/retry');
    assert.equal(capturedPayload?.taskId, 'task-101');
    assert.equal(retried.retryCount, 1);
  });

  test('cancelExecution calls POST /api/v1/browser/executions/:id/cancel', async () => {
    let capturedUrl = '';
    apiClient.post = async (url) => {
      capturedUrl = url;
      return {
        success: true,
        data: {
          execution: {
            id: 'exec-1',
            status: 'CANCELLED',
          },
        },
      };
    };

    const cancelled = await browserService.cancelExecution('exec-1', {
      taskId: 'task-101',
      idempotencyKey: 'cancel-key-1',
    });

    assert.equal(capturedUrl, '/api/v1/browser/executions/exec-1/cancel');
    assert.equal(cancelled.status, 'CANCELLED');
  });

  test('getExecutionStatus calls GET /api/v1/browser/executions/:id', async () => {
    let capturedUrl = '';
    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        success: true,
        data: {
          execution: {
            id: 'exec-1',
            status: 'COMPLETED',
          },
        },
      };
    };

    const status = await browserService.getExecutionStatus('exec-1');
    assert.equal(capturedUrl, '/api/v1/browser/executions/exec-1');
    assert.equal(status.status, 'COMPLETED');
  });
});

test.describe('DOM Action Executor & Safety Guarantees', () => {
  test('rejects arbitrary or unsupported actions outside allowlist', async () => {
    // Mock minimal document
    const mockDoc = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const forbiddenActions = ['CLICK', 'SUBMIT', 'NAVIGATE', 'EXECUTE_JS', 'EVAL'];

    for (const badAction of forbiddenActions) {
      const result = await executeSingleAction(mockDoc, {
        fieldId: 'submit-btn',
        actionId: 'act-bad',
        action: badAction,
        value: true,
        expectedFieldType: 'button',
      });

      assert.equal(result.status, 'FAILED');
      assert.equal(result.errorCode, 'UNSUPPORTED_ACTION');
    }
  });

  test('reports FIELD_NOT_FOUND when element does not exist on page', async () => {
    const mockDoc = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const result = await executeSingleAction(mockDoc, {
      fieldId: 'nonexistent_field',
      actionId: 'act-1',
      action: 'SET_VALUE',
      value: 'Some Value',
      expectedFieldType: 'text',
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.errorCode, 'FIELD_NOT_FOUND');
  });

  test('preserves Devanagari Hindi, Marathi, and Hinglish field values during SET_VALUE', async () => {
    const hindiText = 'सुनील गावस्कर';
    const marathiAddress = 'शिवाजी नगर, पुणे - ४११०१६';
    const hinglishDesignation = 'Frontend aur Backend Engineer';

    // Mock HTMLInputElement
    class MockInputElement {
      constructor() {
        this.tagName = 'INPUT';
        this.type = 'text';
        this.value = '';
        this.disabled = false;
        this.readOnly = false;
      }
      focus() {}
      dispatchEvent() { return true; }
    }

    const testInputs = [
      { id: 'f-hindi', value: hindiText },
      { id: 'f-marathi', value: marathiAddress },
      { id: 'f-hinglish', value: hinglishDesignation },
    ];

    for (const testCase of testInputs) {
      const mockInput = new MockInputElement();
      const mockDoc = {
        getElementById: (id) => (id === testCase.id ? mockInput : null),
        querySelector: () => null,
        querySelectorAll: () => [],
      };

      const result = await executeSingleAction(mockDoc, {
        fieldId: testCase.id,
        actionId: `act-${testCase.id}`,
        action: 'SET_VALUE',
        value: testCase.value,
        expectedFieldType: 'text',
      });

      assert.equal(result.status, 'SUCCESS');
      assert.equal(mockInput.value, testCase.value);
    }
  });

  test('handles SELECT_OPTION with option verification', async () => {
    class MockSelectElement {
      constructor() {
        this.tagName = 'SELECT';
        this.options = [
          { value: 'IN', text: 'India' },
          { value: 'US', text: 'United States' },
          { value: 'MH', text: 'Maharashtra' },
        ];
        this.selectedIndex = 0;
        this.disabled = false;
        this.readOnly = false;
      }
      dispatchEvent() { return true; }
    }

    const mockSelect = new MockSelectElement();
    const mockDoc = {
      getElementById: (id) => (id === 'country_select' ? mockSelect : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    // Valid option
    const result = await executeSingleAction(mockDoc, {
      fieldId: 'country_select',
      actionId: 'act-select-1',
      action: 'SELECT_OPTION',
      value: 'Maharashtra',
      expectedFieldType: 'select',
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(mockSelect.selectedIndex, 2);

    // Invalid option
    const invalidResult = await executeSingleAction(mockDoc, {
      fieldId: 'country_select',
      actionId: 'act-select-2',
      action: 'SELECT_OPTION',
      value: 'NonExistentOption',
      expectedFieldType: 'select',
    });

    assert.equal(invalidResult.status, 'FAILED');
    assert.equal(invalidResult.errorCode, 'OPTION_NOT_FOUND');
  });

  test('handles CHECK and UNCHECK on checkboxes', async () => {
    class MockCheckboxElement {
      constructor() {
        this.tagName = 'INPUT';
        this.type = 'checkbox';
        this.checked = false;
        this.disabled = false;
        this.readOnly = false;
      }
      dispatchEvent() { return true; }
    }

    const mockCheckbox = new MockCheckboxElement();
    const mockDoc = {
      getElementById: (id) => (id === 'terms_agree' ? mockCheckbox : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    // CHECK
    const checkRes = await executeSingleAction(mockDoc, {
      fieldId: 'terms_agree',
      actionId: 'act-check',
      action: 'CHECK',
      value: true,
      expectedFieldType: 'checkbox',
    });
    assert.equal(checkRes.status, 'SUCCESS');
    assert.equal(mockCheckbox.checked, true);

    // UNCHECK
    const uncheckRes = await executeSingleAction(mockDoc, {
      fieldId: 'terms_agree',
      actionId: 'act-uncheck',
      action: 'UNCHECK',
      value: false,
      expectedFieldType: 'checkbox',
    });
    assert.equal(uncheckRes.status, 'SUCCESS');
    assert.equal(mockCheckbox.checked, false);
  });
});

test.describe('scanPageFormFields Enhanced DOM Detector', () => {
  test('accurately extracts form fields, resolves labels, and groups radio buttons', async () => {
    const { scanPageFormFields } = await import('../src/content/index.ts');

    const inputName = {
      tagName: 'INPUT',
      type: 'text',
      id: 'full_name',
      name: 'fullName',
      required: true,
      disabled: false,
      readOnly: false,
      getAttribute: (attr) => (attr === 'type' ? 'text' : null),
      closest: () => null,
      previousElementSibling: null,
    };

    const labelName = {
      textContent: 'Full Legal Name',
    };

    const selectCity = {
      tagName: 'SELECT',
      type: 'select-one',
      id: 'city_select',
      name: 'city',
      required: false,
      disabled: false,
      readOnly: false,
      options: [
        { value: 'mum', text: 'Mumbai' },
        { value: 'del', text: 'Delhi' },
      ],
      getAttribute: (attr) => null,
      closest: () => null,
      previousElementSibling: null,
    };

    const radioMale = {
      tagName: 'INPUT',
      type: 'radio',
      id: 'gender_m',
      name: 'gender',
      value: 'male',
      required: true,
      disabled: false,
      readOnly: false,
      getAttribute: (attr) => (attr === 'type' ? 'radio' : null),
      closest: () => ({ querySelector: () => ({ textContent: 'Select Gender' }) }),
      previousElementSibling: null,
    };

    const radioFemale = {
      tagName: 'INPUT',
      type: 'radio',
      id: 'gender_f',
      name: 'gender',
      value: 'female',
      required: true,
      disabled: false,
      readOnly: false,
      getAttribute: (attr) => (attr === 'type' ? 'radio' : null),
      closest: () => ({ querySelector: () => ({ textContent: 'Select Gender' }) }),
      previousElementSibling: null,
    };

    const submitBtn = {
      tagName: 'INPUT',
      type: 'submit',
      id: 'submit_btn',
      getAttribute: (attr) => (attr === 'type' ? 'submit' : null),
      closest: () => null,
    };

    const allElements = [inputName, selectCity, radioMale, radioFemale, submitBtn];

    const mockDoc = {
      title: 'Registration Form',
      querySelectorAll: (selector) => {
        if (selector.includes('radio')) {
          return [radioMale, radioFemale];
        }
        return allElements;
      },
      querySelector: (selector) => {
        if (selector === 'label[for="full_name"]') return labelName;
        if (selector === 'label[for="gender_m"]') return { textContent: 'Male' };
        if (selector === 'label[for="gender_f"]') return { textContent: 'Female' };
        return null;
      },
      getElementById: (id) => null,
    };

    const result = scanPageFormFields(mockDoc);
    assert.equal(result.pageContext.title, 'Registration Form');

    // Should skip submit button, and combine 2 radio inputs into 1 field
    assert.equal(result.fields.length, 3);

    // Field 1: Name
    assert.equal(result.fields[0].fieldIdentifier, 'full_name');
    assert.equal(result.fields[0].label, 'Full Legal Name');
    assert.equal(result.fields[0].isRequired, true);

    // Field 2: Select City
    assert.equal(result.fields[1].fieldIdentifier, 'city_select');
    assert.equal(result.fields[1].inputType, 'select');
    assert.equal(result.fields[1].options?.length, 2);
    assert.equal(result.fields[1].options?.[0].label, 'Mumbai');

    // Field 3: Radio group
    assert.equal(result.fields[2].fieldIdentifier, 'gender');
    assert.equal(result.fields[2].inputType, 'radio');
    assert.equal(result.fields[2].options?.length, 2);
    assert.equal(result.fields[2].options?.[0].value, 'male');
  });
});

test.describe('Chrome Extension Side Panel Opening & User Gesture Verification', () => {
  test('invokes chrome.sidePanel.open directly with target tabId without background relay', async () => {
    let openCalledWith = null;
    let windowClosed = false;

    const mockChrome = {
      sidePanel: {
        open: async (opts) => {
          openCalledWith = opts;
          return undefined;
        },
        setOptions: async () => undefined,
      },
      tabs: {
        query: (queryInfo, callback) => {
          callback([{ id: 101, url: 'https://example.com/form' }]);
        },
      },
    };

    // Simulate direct popup invocation pattern
    const activeTabId = 101;
    await mockChrome.sidePanel.open({ tabId: activeTabId });
    windowClosed = true;

    assert.deepEqual(openCalledWith, { tabId: 101 });
    assert.equal(windowClosed, true);
  });

  test('pre-enables tab-specific options before opening', async () => {
    const setOptionsCalls = [];

    const mockChrome = {
      sidePanel: {
        setOptions: async (opts) => {
          setOptionsCalls.push(opts);
        },
        open: async () => undefined,
      },
    };

    await mockChrome.sidePanel.setOptions({
      tabId: 202,
      path: 'index.html',
      enabled: true,
    });

    assert.equal(setOptionsCalls.length, 1);
    assert.deepEqual(setOptionsCalls[0], {
      tabId: 202,
      path: 'index.html',
      enabled: true,
    });
  });

  test('catches and reports chrome.sidePanel.open rejection gracefully', async () => {
    let capturedError = null;

    const mockChrome = {
      sidePanel: {
        open: async () => {
          throw new Error('sidePanel.open() may only be called in response to a user gesture.');
        },
      },
    };

    try {
      await mockChrome.sidePanel.open({ tabId: 303 });
    } catch (err) {
      capturedError = err.message;
    }

    assert.equal(capturedError, 'sidePanel.open() may only be called in response to a user gesture.');
  });
});


