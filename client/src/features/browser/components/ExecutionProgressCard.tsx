import { Loader2, PlayCircle, CheckCircle2, AlertOctagon, XCircle } from 'lucide-react';
import type { BrowserExecution, ActionResultItem } from '../types/browser.types';

interface ExecutionProgressCardProps {
  execution: BrowserExecution | null;
  results: ActionResultItem[];
  isExecuting: boolean;
  isCancelling: boolean;
  onCancel: () => void;
}

export function ExecutionProgressCard({
  execution,
  results,
  isExecuting,
  isCancelling,
  onCancel,
}: ExecutionProgressCardProps) {
  if (!execution && !isExecuting) return null;

  const totalActions = execution?.instruction?.actions?.length || results.length || 0;
  const completedCount = results.filter((r) => r.status === 'SUCCESS').length;
  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  const status = execution?.status || (isExecuting ? 'IN_PROGRESS' : 'ISSUED');

  const progressPercent = totalActions > 0 ? Math.round((results.length / totalActions) * 100) : 0;

  return (
    <div className="p-4 bg-card border border-divider rounded-xl shadow-xs flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isExecuting
                ? 'bg-accent/15 text-accent'
                : status === 'COMPLETED'
                ? 'bg-success/15 text-success'
                : status === 'PARTIAL'
                ? 'bg-warning/15 text-warning'
                : status === 'CANCELLED'
                ? 'bg-divider/50 text-text-secondary'
                : 'bg-error/15 text-error'
            }`}
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : status === 'COMPLETED' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : status === 'CANCELLED' ? (
              <AlertOctagon className="w-4 h-4" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-text-primary">
              {isExecuting
                ? 'Filling Webpage Form...'
                : status === 'COMPLETED'
                ? 'Form Filling Completed'
                : status === 'PARTIAL'
                ? 'Partially Filled'
                : status === 'CANCELLED'
                ? 'Execution Cancelled'
                : 'Form Execution'}
            </h4>
            <p className="text-[11px] text-text-secondary mt-0.5">
              Status: <span className="font-semibold uppercase">{status}</span> • {results.length} of {totalActions} processed
            </p>
          </div>
        </div>

        {isExecuting && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-error/30 text-error hover:bg-error/10 text-xs font-medium transition-colors shrink-0"
          >
            {isCancelling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            <span>Cancel</span>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-divider/40 h-2 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            status === 'COMPLETED'
              ? 'bg-success'
              : status === 'PARTIAL'
              ? 'bg-warning'
              : status === 'FAILED'
              ? 'bg-error'
              : 'bg-accent'
          }`}
          style={{ width: `${Math.max(5, progressPercent)}%` }}
        />
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-divider/60 text-center">
        <div className="p-1.5 bg-page-bg rounded-lg">
          <span className="text-[10px] text-text-secondary block">Total</span>
          <span className="text-xs font-bold text-text-primary">{totalActions}</span>
        </div>
        <div className="p-1.5 bg-success/5 rounded-lg">
          <span className="text-[10px] text-success block">Success</span>
          <span className="text-xs font-bold text-success">{completedCount}</span>
        </div>
        <div className="p-1.5 bg-error/5 rounded-lg">
          <span className="text-[10px] text-error block">Failed</span>
          <span className="text-xs font-bold text-error">{failedCount}</span>
        </div>
      </div>
    </div>
  );
}

