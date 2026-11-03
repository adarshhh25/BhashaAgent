import { CheckCircle2, XCircle, SkipForward } from 'lucide-react';
import type { ActionResultItem as ActionResultItemType } from '../types/browser.types';

interface ActionResultItemProps {
  result: ActionResultItemType;
  label?: string;
}

export function ActionResultItem({ result, label }: ActionResultItemProps) {
  const isSuccess = result.status === 'SUCCESS';
  const isFailed = result.status === 'FAILED';

  return (
    <div
      className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 transition-all ${
        isSuccess
          ? 'bg-success/5 border-success/20'
          : isFailed
          ? 'bg-error/5 border-error/20'
          : 'bg-page-bg border-divider'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
              isSuccess
                ? 'text-success'
                : isFailed
                ? 'text-error'
                : 'text-text-placeholder'
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : isFailed ? (
              <XCircle className="w-4 h-4" />
            ) : (
              <SkipForward className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <span className="font-medium text-text-primary truncate block" title={label || result.fieldId}>
              {label || result.fieldId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-text-secondary uppercase px-1.5 py-0.5 rounded-sm bg-divider/60 font-mono">
            {result.actionType}
          </span>
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
              isSuccess
                ? 'bg-success/15 text-success'
                : isFailed
                ? 'bg-error/15 text-error'
                : 'bg-divider/60 text-text-secondary'
            }`}
          >
            {result.status}
          </span>
        </div>
      </div>

      {isFailed && (result.message || result.errorCode) && (
        <div className="text-[11px] text-error pl-7 leading-tight">
          {result.errorCode && <span className="font-semibold">{result.errorCode}: </span>}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
}
