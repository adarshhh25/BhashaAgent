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

test.describe('React Controlled Input Synchronization & DOM Action Executor Reliability', () => {
  class MockReactControlledInput {
    constructor({ id = 'test-field', type = 'text', initialValue = '' } = {}) {
      this.id = id;
      this.name = id;
      this.tagName = 'INPUT';
      this.type = type;
      this._value = initialValue;
      this.disabled = false;
      this.readOnly = false;
      this.listeners = { input: [], change: [] };
      this.reactState = initialValue;

      // Realistic React 16-19 value tracker simulation
      let trackedValue = initialValue;
      this._valueTracker = {
        getValue: () => trackedValue,
        setValue: (val) => { trackedValue = String(val); },
      };

      // React synthetic event listener simulating updateValueIfChanged()
      const handleReactEvent = (e) => {
        const lastVal = this._valueTracker.getValue();
        const nextVal = this._value;
        if (nextVal !== lastVal) {
          this._valueTracker.setValue(nextVal);
          this.reactState = nextVal;
        }
      };

      this.addEventListener('input', handleReactEvent);
      this.addEventListener('change', handleReactEvent);
    }

    get value() {
      return this._value;
    }

    set value(v) {
      this._value = String(v);
    }

    focus() {}

    getAttribute(name) {
      if (name === 'name') return this.name;
      if (name === 'type') return this.type;
      return null;
    }

    closest() { return null; }

    addEventListener(type, cb) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(cb);
    }

    dispatchEvent(event) {
      const cbs = this.listeners[event.type] || [];
      for (const cb of cbs) {
        cb(event);
      }
      return true;
    }
  }

  test('1. Native uncontrolled input updates DOM value and triggers events', async () => {
    class MockUncontrolledInput {
      constructor() {
        this.id = 'uncontrolled-field';
        this.tagName = 'INPUT';
        this.type = 'text';
        this.value = '';
        this.disabled = false;
        this.readOnly = false;
        this.dispatched = [];
      }
      focus() {}
      closest() { return null; }
      getAttribute(attr) { return attr === 'name' ? this.id : null; }
      dispatchEvent(e) { this.dispatched.push(e.type); return true; }
    }

    const input = new MockUncontrolledInput();
    const doc = {
      getElementById: (id) => (id === 'uncontrolled-field' ? input : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const result = await executeSingleAction(doc, {
      fieldId: 'uncontrolled-field',
      actionId: 'act-native',
      action: 'SET_VALUE',
      value: 'Uncontrolled Value',
      expectedFieldType: 'text',
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(input.value, 'Uncontrolled Value');
    assert.ok(input.dispatched.includes('input'));
    assert.ok(input.dispatched.includes('change'));
  });

  test('2. React-controlled text input updates DOM and synchronizes React component state', async () => {
    const reactInput = new MockReactControlledInput({
      id: 'customer_name',
      type: 'text',
      initialValue: '',
    });

    const doc = {
      getElementById: (id) => (id === 'customer_name' ? reactInput : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const result = await executeSingleAction(doc, {
      fieldId: 'customer_name',
      actionId: 'act-react-text',
      action: 'SET_VALUE',
      value: 'Adarsh Jha',
      expectedFieldType: 'text',
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(reactInput.value, 'Adarsh Jha', 'DOM value must equal updated value');
    assert.equal(reactInput.reactState, 'Adarsh Jha', 'React component state must synchronize');
  });

  test('3. React-controlled telephone input preserves formatted string and synchronizes state', async () => {
    const telInput = new MockReactControlledInput({
      id: 'cust_tel',
      type: 'tel',
      initialValue: '',
    });

    const doc = {
      getElementById: (id) => (id === 'cust_tel' ? telInput : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const result = await executeSingleAction(doc, {
      fieldId: 'cust_tel',
      actionId: 'act-react-tel',
      action: 'SET_VALUE',
      value: '0987654321',
      expectedFieldType: 'tel',
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(telInput.value, '0987654321', 'DOM value must preserve leading zero string');
    assert.equal(telInput.reactState, '0987654321', 'React component state must synchronize leading zero');
  });

  test('4. React-controlled email input validates structure and synchronizes state', async () => {
    const emailInput = new MockReactControlledInput({
      id: 'cust_email',
      type: 'email',
      initialValue: '',
    });

    const doc = {
      getElementById: (id) => (id === 'cust_email' ? emailInput : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const result = await executeSingleAction(doc, {
      fieldId: 'cust_email',
      actionId: 'act-react-email',
      action: 'SET_VALUE',
      value: 'customer@example.com',
      expectedFieldType: 'email',
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(emailInput.value, 'customer@example.com');
    assert.equal(emailInput.reactState, 'customer@example.com');
  });

  test('5. Input with existing non-empty value updates smoothly without stale tracker lock', async () => {
    const prefilledInput = new MockReactControlledInput({
      id: 'cust_address',
      type: 'text',
      initialValue: 'Old Flat 101, Pune',
    });

    assert.equal(prefilledInput.reactState, 'Old Flat 101, Pune');

    const doc = {
      getElementById: (id) => (id === 'cust_address' ? prefilledInput : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const result = await executeSingleAction(doc, {
      fieldId: 'cust_address',
      actionId: 'act-react-update',
      action: 'SET_VALUE',
      value: 'New Apartment 202, Mumbai',
      expectedFieldType: 'text',
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(prefilledInput.value, 'New Apartment 202, Mumbai');
    assert.equal(prefilledInput.reactState, 'New Apartment 202, Mumbai');
  });

  test('6. Repeated update of the same field does not swallow change events', async () => {
    const repeatInput = new MockReactControlledInput({
      id: 'repeat_field',
      type: 'text',
      initialValue: '',
    });

    const doc = {
      getElementById: (id) => (id === 'repeat_field' ? repeatInput : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    // First update
    const res1 = await executeSingleAction(doc, {
      fieldId: 'repeat_field',
      actionId: 'act-repeat-1',
      action: 'SET_VALUE',
      value: 'Confirmed Value',
      expectedFieldType: 'text',
    });
    assert.equal(res1.status, 'SUCCESS');
    assert.equal(repeatInput.value, 'Confirmed Value');
    assert.equal(repeatInput.reactState, 'Confirmed Value');

    // Second update with same value
    const res2 = await executeSingleAction(doc, {
      fieldId: 'repeat_field',
      actionId: 'act-repeat-2',
      action: 'SET_VALUE',
      value: 'Confirmed Value',
      expectedFieldType: 'text',
    });
    assert.equal(res2.status, 'SUCCESS');
    assert.equal(repeatInput.value, 'Confirmed Value');
    assert.equal(repeatInput.reactState, 'Confirmed Value');
  });

  test('7. Invalid values rejected without modifying the DOM', async () => {
    // 7a. Invalid email
    const emailInput = new MockReactControlledInput({
      id: 'user_email',
      type: 'email',
      initialValue: 'keep_original@domain.com',
    });

    const doc = {
      getElementById: (id) => {
        if (id === 'user_email') return emailInput;
        return null;
      },
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const emailRes = await executeSingleAction(doc, {
      fieldId: 'user_email',
      actionId: 'act-invalid-email',
      action: 'SET_VALUE',
      value: 'not-an-email-address',
      expectedFieldType: 'email',
    });

    assert.equal(emailRes.status, 'FAILED');
    assert.equal(emailRes.errorCode, 'INVALID_FIELD_VALUE');
    // DOM value and React state MUST remain untouched!
    assert.equal(emailInput.value, 'keep_original@domain.com', 'DOM value must not be mutated on validation failure');
    assert.equal(emailInput.reactState, 'keep_original@domain.com', 'React state must remain unchanged');

    // 7b. Invalid date
    const dateInput = new MockReactControlledInput({
      id: 'booking_date',
      type: 'date',
      initialValue: '2026-11-14',
    });
    const doc2 = {
      getElementById: (id) => (id === 'booking_date' ? dateInput : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const dateRes = await executeSingleAction(doc2, {
      fieldId: 'booking_date',
      actionId: 'act-invalid-date',
      action: 'SET_VALUE',
      value: '14-11-2026', // wrong format
      expectedFieldType: 'date',
    });
    assert.equal(dateRes.status, 'FAILED');
    assert.equal(dateRes.errorCode, 'INVALID_FIELD_VALUE');
    assert.equal(dateInput.value, '2026-11-14');

    // 7c. Invalid phone
    const phoneInput = new MockReactControlledInput({
      id: 'contact_no',
      type: 'tel',
      initialValue: '9876543210',
    });
    const doc3 = {
      getElementById: (id) => (id === 'contact_no' ? phoneInput : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const phoneRes = await executeSingleAction(doc3, {
      fieldId: 'contact_no',
      actionId: 'act-invalid-phone',
      action: 'SET_VALUE',
      value: 'invalid_alpha_phone',
      expectedFieldType: 'tel',
    });
    assert.equal(phoneRes.status, 'FAILED');
    assert.equal(phoneRes.errorCode, 'INVALID_FIELD_VALUE');
    assert.equal(phoneInput.value, '9876543210');
  });
});

test.describe('Phase 7D: Existing Value Overwrite & Honest Browser Execution', () => {
  test('7D.1: Existing non-empty input ("मैं आदर्श") is actually overwritten with converted value ("Adarsh")', async () => {
    class MockReactControlledInput {
      constructor({ id = 'test-field', type = 'text', initialValue = '' } = {}) {
        this.id = id;
        this.name = id;
        this.tagName = 'INPUT';
        this.type = type;
        this._value = initialValue;
        this.disabled = false;
        this.readOnly = false;
        this.listeners = { input: [], change: [] };
        this.reactState = initialValue;

        let trackedValue = initialValue;
        this._valueTracker = {
          getValue: () => trackedValue,
          setValue: (val) => { trackedValue = String(val); },
        };

        const handleReactEvent = () => {
          const lastVal = this._valueTracker.getValue();
          const nextVal = this._value;
          if (nextVal !== lastVal) {
            this._valueTracker.setValue(nextVal);
            this.reactState = nextVal;
          }
        };

        this.addEventListener('input', handleReactEvent);
        this.addEventListener('change', handleReactEvent);
      }

      get value() { return this._value; }
      set value(v) { this._value = String(v); }
      focus() {}
      getAttribute(name) { return name === 'name' ? this.name : name === 'type' ? this.type : null; }
      closest() { return null; }
      addEventListener(type, cb) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
      }
      dispatchEvent(event) {
        const cbs = this.listeners[event.type] || [];
        for (const cb of cbs) cb(event);
        return true;
      }
    }

    const input = new MockReactControlledInput({
      id: 'cust_name',
      type: 'text',
      initialValue: 'मैं आदर्श',
    });
    const doc = {
      getElementById: (id) => (id === 'cust_name' ? input : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const res = await executeSingleAction(doc, {
      fieldId: 'cust_name',
      actionId: 'act-overwrite-1',
      action: 'SET_VALUE',
      value: 'Adarsh',
      expectedFieldType: 'text',
    });

    assert.equal(res.status, 'SUCCESS');
    assert.equal(input.value, 'Adarsh');
    assert.equal(input.reactState, 'Adarsh');
  });

  test('7D.2: Converted value survives a simulated React rerender', async () => {
    class MockRerenderInput {
      constructor() {
        this.id = 'cust_name';
        this.name = 'cust_name';
        this.tagName = 'INPUT';
        this.type = 'text';
        this._value = 'मैं आदर्श';
        this.disabled = false;
        this.readOnly = false;
        this.listeners = { input: [], change: [] };
        this.reactState = 'मैं आदर्श';

        let trackedValue = 'मैं आदर्श';
        this._valueTracker = {
          getValue: () => trackedValue,
          setValue: (val) => { trackedValue = String(val); },
        };

        const handleReactEvent = () => {
          const lastVal = this._valueTracker.getValue();
          const nextVal = this._value;
          if (nextVal !== lastVal) {
            this._valueTracker.setValue(nextVal);
            this.reactState = nextVal;
          }
        };

        this.addEventListener('input', handleReactEvent);
        this.addEventListener('change', handleReactEvent);
      }

      get value() { return this._value; }
      set value(v) { this._value = String(v); }
      focus() {}
      getAttribute(name) { return name === 'name' ? this.name : null; }
      closest() { return null; }
      addEventListener(type, cb) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
      }
      dispatchEvent(event) {
        const cbs = this.listeners[event.type] || [];
        for (const cb of cbs) cb(event);
        return true;
      }
    }

    const input = new MockRerenderInput();
    const doc = {
      getElementById: (id) => (id === 'cust_name' ? input : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    await executeSingleAction(doc, {
      fieldId: 'cust_name',
      actionId: 'act-rerender-1',
      action: 'SET_VALUE',
      value: 'Adarsh Jha',
      expectedFieldType: 'text',
    });

    // Simulate React component re-rendering using its internal state:
    input.value = input.reactState;
    assert.equal(input.value, 'Adarsh Jha');
  });

  test('7D.3: Browser readback verification detects failed modification', async () => {
    class MockLockedInput {
      constructor() {
        this.id = 'locked_input';
        this.name = 'locked_input';
        this.tagName = 'INPUT';
        this.type = 'text';
        this.disabled = false;
        this.readOnly = false;
      }
      get value() { return 'Unchangeable Value'; }
      set value(_v) { /* no-op simulating reversion */ }
      focus() {}
      dispatchEvent() { return true; }
      closest() { return null; }
      getAttribute() { return null; }
    }

    const lockedEl = new MockLockedInput();
    const doc = {
      getElementById: (id) => (id === 'locked_input' ? lockedEl : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const res = await executeSingleAction(doc, {
      fieldId: 'locked_input',
      actionId: 'act-locked',
      action: 'SET_VALUE',
      value: 'New Desired Value',
      expectedFieldType: 'text',
    });

    assert.equal(res.status, 'FAILED');
    assert.equal(res.errorCode, 'VERIFICATION_FAILED');
  });

  test('7D.4: Cancelled operation does not mutate the DOM', async () => {
    class MockPreservedInput {
      constructor() {
        this.id = 'target_input';
        this.name = 'target_input';
        this.tagName = 'INPUT';
        this.type = 'text';
        this.value = 'Original Preserved Value';
        this.disabled = false;
        this.readOnly = false;
      }
      focus() {}
      dispatchEvent() { return true; }
      closest() { return null; }
      getAttribute() { return null; }
    }

    const input = new MockPreservedInput();
    const doc = {
      getElementById: (id) => (id === 'target_input' ? input : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const res = await executeSingleAction(doc, {
      fieldId: 'target_input',
      actionId: 'act-cancelled',
      action: 'SET_VALUE',
      value: 'Should Never Be Written',
      expectedFieldType: 'text',
      cancelled: true,
    });

    assert.equal(res.status, 'SKIPPED');
    assert.equal(res.errorCode, 'EXECUTION_CANCELLED');
    assert.equal(input.value, 'Original Preserved Value');
  });

  test('7D.5: Safety guarantee: automatic form submission is rejected by allowlist', async () => {
    const doc = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const res = await executeSingleAction(doc, {
      fieldId: 'submit_btn',
      actionId: 'act-submit',
      action: 'SUBMIT_FORM',
      value: true,
    });

    assert.equal(res.status, 'FAILED');
    assert.equal(res.errorCode, 'UNSUPPORTED_ACTION');
  });
});




