import { CheckCircle2, RotateCw, ExternalLink, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { BrowserExecution, ActionResultItem } from '../types/browser.types';

interface ExecutionSummaryViewProps {
  execution: BrowserExecution;
  results: ActionResultItem[];
  isRetrying: boolean;
  onRetry: () => void;
  onDone: () => void;
}

export function ExecutionSummaryView({
  execution,
  results,
  isRetrying,
  onRetry,
  onDone,
}: ExecutionSummaryViewProps) {
  const isCompleted = execution.status === 'COMPLETED';
  const isPartial = execution.status === 'PARTIAL';
  const isFailed = execution.status === 'FAILED';

  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  const successCount = results.filter((r) => r.status === 'SUCCESS').length;

  return (
    <div className="p-4 bg-card border border-divider rounded-xl shadow-xs flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isCompleted
              ? 'bg-success/15 text-success'
              : isPartial
              ? 'bg-warning/15 text-warning'
              : 'bg-error/15 text-error'
          }`}
        >
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : isPartial ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-text-primary">
            {isCompleted
              ? 'All Fields Filled Successfully'
              : isPartial
              ? `Partially Filled (${successCount} Succeeded, ${failedCount} Failed)`
              : 'Execution Completed with Errors'}
          </h4>
          <p className="text-xs text-text-secondary mt-0.5 leading-normal">
            {isCompleted
              ? 'Values have been populated into the active webpage according to your approved snapshot.'
              : 'Some form inputs could not be populated. You can review the details below and retry failed fields.'}
          </p>
        </div>
      </div>

      {/* Human Review Reminder */}
      <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl text-xs text-text-primary flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1 leading-normal">
          <span className="font-semibold text-accent">Review & Submit Manually</span>
          <p className="text-[11px] text-text-secondary">
            BhashaAgent filled approved fields only. Please inspect the populated webpage form in Chrome to ensure completeness, and submit the form when you are ready.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-divider">
        {(isPartial || isFailed) && (
          <button
            type="button"
            disabled={isRetrying}
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-warning/40 text-warning hover:bg-warning/10 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>Retry Failed Actions ({failedCount})</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDone}
          className="ml-auto flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-page-bg border border-divider text-text-primary hover:bg-divider/30 text-xs font-medium transition-colors"
        >
          <span>Close Execution</span>
          <ExternalLink className="w-3 h-3 text-text-placeholder" />
        </button>
      </div>
    </div>
  );
}

