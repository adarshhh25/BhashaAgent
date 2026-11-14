import { Play, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useBrowserConnection } from '../hooks/useBrowserConnection';
import { useBrowserExecution } from '../hooks/useBrowserExecution';
import { BrowserConnectionBanner } from './BrowserConnectionBanner';
import { ExecutionProgressCard } from './ExecutionProgressCard';
import { ActionResultList } from './ActionResultList';
import { ExecutionSummaryView } from './ExecutionSummaryView';
import type { FormTask, DetectedField } from '../../forms/types/form.types';

interface BrowserExecutionPanelProps {
  task: FormTask;
  fields?: DetectedField[];
}

export function BrowserExecutionPanel({ task, fields = [] }: BrowserExecutionPanelProps) {
  const {
    status: connectionStatus,
    activeUrl,
    activeTitle,
    pageSession,
    isRegisteringSession,
    error: connectionError,
    refreshTab,
    registerSession,
  } = useBrowserConnection(task, fields);

  const {
    execution,
    results,
    isExecuting,
    isRetrying,
    isCancelling,
    error: executionError,
    startExecution,
    retryFailedActions,
    cancelExecution,
    resetExecution,
  } = useBrowserExecution(task);

  const executableFieldsCount = fields.filter(
    (f) => Boolean(f.fieldValues?.[0]?.value) && !f.isDisabled && !f.isReadOnly,
  ).length;

  const handleStartFilling = async () => {
    // Ensure session is registered
    let session = pageSession;
    if (!session) {
      session = await registerSession();
    }

    if (!session) {
      return;
    }

    await startExecution(session);
  };

  const handleRetry = async () => {
    let session = pageSession;
    if (!session) {
      session = await registerSession();
    }
    if (!session) return;

    await retryFailedActions(session);
  };

  const displayError = executionError || connectionError;

  return (
    <div className="flex flex-col gap-3">
      {/* Active Tab & Page Match Banner */}
      <BrowserConnectionBanner
        status={connectionStatus}
        activeUrl={activeUrl}
        activeTitle={activeTitle}
        taskUrl={task.webpageUrl}
        isRegisteringSession={isRegisteringSession}
        onRefresh={() => void refreshTab()}
      />

      {/* Error alert if any */}
      {displayError && (
        <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{displayError}</span>
        </div>
      )}

      {/* Primary Trigger / Execution State */}
      {!execution && !isExecuting && (
        <div className="p-4 bg-card border border-divider rounded-xl shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-accent/15 text-accent">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-text-primary">
                  Ready for Direct Autofill
                </h4>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  {executableFieldsCount} field{executableFieldsCount === 1 ? '' : 's'} ready to populate
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isRegisteringSession || executableFieldsCount === 0}
              onClick={() => void handleStartFilling()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {isRegisteringSession ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Fill Webpage Form</span>
            </button>
          </div>

          <p className="text-[10px] text-text-placeholder leading-normal pt-2 border-t border-divider/60">
            Direct Execution: Form fields are populated directly into your active browser tab. Forms are NEVER automatically submitted.
          </p>
        </div>
      )}

      {/* In-Progress or Finished Progress Card */}
      {(execution || isExecuting) && (
        <ExecutionProgressCard
          execution={execution}
          results={results}
          isExecuting={isExecuting}
          isCancelling={isCancelling}
          onCancel={() => void cancelExecution()}
        />
      )}

      {/* Summary View upon Completion or Partial Outcome */}
      {execution && !isExecuting && (
        <ExecutionSummaryView
          execution={execution}
          results={results}
          isRetrying={isRetrying}
          onRetry={() => void handleRetry()}
          onDone={resetExecution}
        />
      )}

      {/* Detailed Action Results List */}
      {results.length > 0 && (
        <ActionResultList results={results} fields={fields} />
      )}
    </div>
  );
}
