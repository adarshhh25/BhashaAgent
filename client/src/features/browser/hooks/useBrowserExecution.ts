/**
 * Hook for Browser Execution Lifecycle & Progress Management
 *
 * Coordinates:
 * - Issuing fill instructions from Backend Phase 9
 * - Safe action execution via content script
 * - Reporting structured results & acknowledgements
 * - Retries and cancellations with idempotency
 */

import { useState, useCallback } from 'react';
import { browserService } from '../services/browser.service';
import { executeInstructionsOnPage } from '../../../content';
import {
  BROWSER_PROTOCOL_VERSION,
  type BrowserExecution,
  type BrowserPageSession,
  type ActionResultItem,
  type BrowserFillAction,
} from '../types/browser.types';
import type { FormTask } from '../../forms/types/form.types';

interface UseBrowserExecutionResult {
  execution: BrowserExecution | null;
  results: ActionResultItem[];
  isExecuting: boolean;
  isRetrying: boolean;
  isCancelling: boolean;
  error: string | null;
  startExecution: (session: BrowserPageSession) => Promise<boolean>;
  retryFailedActions: (session: BrowserPageSession) => Promise<boolean>;
  cancelExecution: () => Promise<boolean>;
  resetExecution: () => void;
}

export function useBrowserExecution(task: FormTask | null): UseBrowserExecutionResult {
  const [execution, setExecution] = useState<BrowserExecution | null>(null);
  const [results, setResults] = useState<ActionResultItem[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Helper to dispatch actions to content script either via Chrome messaging
   * or direct in-page execution.
   */
  const dispatchToPage = async (
    actions: BrowserFillAction[],
  ): Promise<{ overallStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED'; results: ActionResultItem[] }> => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'FORWARD_TO_CONTENT',
          payload: {
            type: 'EXECUTE_FILL_INSTRUCTIONS',
            payload: { actions },
          },
        });

        if (response?.success && response?.data) {
          return response.data;
        }
      } catch (err) {
        console.warn('Chrome runtime message forward failed, falling back to local runner:', err);
      }
    }

    // Direct fallback (runs in document context or unit test environment)
    return executeInstructionsOnPage(actions);
  };

  /**
   * Start form execution for an approved task.
   */
  const startExecution = useCallback(
    async (session: BrowserPageSession): Promise<boolean> => {
      if (!task) {
        setError('No active form task');
        return false;
      }

      if (task.status !== 'APPROVED_FOR_FILLING') {
        setError('Task must be approved for filling before execution can begin');
        return false;
      }

      setIsExecuting(true);
      setError(null);

      try {
        const instructionReqId = crypto.randomUUID();
        const idempotencyKey = `exec-${task.id}-v${task.version}-${Date.now()}`;

        // 1. Issue instructions from Phase 9 backend
        const issued = await browserService.issueInstructions({
          protocolVersion: BROWSER_PROTOCOL_VERSION,
          messageId: instructionReqId,
          messageType: 'FILL_INSTRUCTIONS_REQUEST',
          taskId: task.id,
          timestamp: new Date().toISOString(),
          idempotencyKey,
          pageSessionId: session.id,
        });

        setExecution(issued);

        const actions = issued.instruction?.actions || [];
        if (actions.length === 0) {
          setError('No approved actions were issued by backend');
          return false;
        }

        // 2. Execute actions on webpage
        const outcome = await dispatchToPage(actions);
        setResults(outcome.results);

        // 3. Submit acknowledgement to backend
        const ackIdempotencyKey = `ack-${issued.id}-${Date.now()}`;
        const acknowledged = await browserService.acknowledgeExecution(issued.id, {
          protocolVersion: BROWSER_PROTOCOL_VERSION,
          messageId: crypto.randomUUID(),
          messageType: 'FORM_FILL_ACK',
          taskId: task.id,
          timestamp: new Date().toISOString(),
          idempotencyKey: ackIdempotencyKey,
          executionId: issued.id,
          actionId: issued.instruction.actionId,
          pageSessionId: session.id,
          status: outcome.overallStatus,
          results: outcome.results,
        });

        setExecution(acknowledged);
        return outcome.overallStatus === 'COMPLETED';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Execution failed';
        setError(msg);
        return false;
      } finally {
        setIsExecuting(false);
      }
    },
    [task],
  );

  /**
   * Retry failed actions only.
   */
  const retryFailedActions = useCallback(
    async (session: BrowserPageSession): Promise<boolean> => {
      if (!task || !execution) {
        setError('No active execution to retry');
        return false;
      }

      setIsRetrying(true);
      setError(null);

      try {
        const idempotencyKey = `retry-${execution.id}-${Date.now()}`;
        const retried = await browserService.retryExecution(execution.id, {
          protocolVersion: BROWSER_PROTOCOL_VERSION,
          taskId: task.id,
          idempotencyKey,
          pageSessionId: session.id,
        });

        setExecution(retried);

        const retryActions = retried.instruction?.actions || [];
        if (retryActions.length === 0) {
          return true;
        }

        // Execute only retried actions on webpage
        const outcome = await dispatchToPage(retryActions);

        // Merge updated results with previous results
        setResults((prev) => {
          const map = new Map(prev.map((r) => [r.fieldId, r]));
          for (const item of outcome.results) {
            map.set(item.fieldId, item);
          }
          return Array.from(map.values());
        });

        // Submit acknowledgement for retry
        const acknowledged = await browserService.acknowledgeExecution(retried.id, {
          protocolVersion: BROWSER_PROTOCOL_VERSION,
          messageId: crypto.randomUUID(),
          messageType: 'FORM_FILL_ACK',
          taskId: task.id,
          timestamp: new Date().toISOString(),
          idempotencyKey: `ack-retry-${retried.id}-${Date.now()}`,
          executionId: retried.id,
          actionId: retried.instruction.actionId,
          pageSessionId: session.id,
          status: outcome.overallStatus,
          results: outcome.results,
        });

        setExecution(acknowledged);
        return outcome.overallStatus === 'COMPLETED';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Retry failed';
        setError(msg);
        return false;
      } finally {
        setIsRetrying(false);
      }
    },
    [task, execution],
  );

  /**
   * Cancel an in-progress execution.
   */
  const cancelExecution = useCallback(async (): Promise<boolean> => {
    if (!task || !execution) return false;

    setIsCancelling(true);
    setError(null);

    try {
      const idempotencyKey = `cancel-${execution.id}-${Date.now()}`;
      const cancelled = await browserService.cancelExecution(execution.id, {
        taskId: task.id,
        idempotencyKey,
      });

      setExecution(cancelled);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cancellation failed';
      setError(msg);
      return false;
    } finally {
      setIsCancelling(false);
    }
  }, [task, execution]);

  const resetExecution = useCallback(() => {
    setExecution(null);
    setResults([]);
    setError(null);
  }, []);

  return {
    execution,
    results,
    isExecuting,
    isRetrying,
    isCancelling,
    error,
    startExecution,
    retryFailedActions,
    cancelExecution,
    resetExecution,
  };
}
