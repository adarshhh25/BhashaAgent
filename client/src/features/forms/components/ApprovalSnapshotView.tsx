import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { FormTask, TaskReviewResult, DetectedField } from '../types/form.types';
import { BrowserExecutionPanel } from '../../browser/components/BrowserExecutionPanel';

interface ApprovalSnapshotViewProps {
  task: FormTask;
  review: TaskReviewResult | null;
  detectedFields?: DetectedField[];
  isApprovingFinal?: boolean;
  onFinalApprove?: () => Promise<void>;
}

function stringifyValue(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val === null || val === undefined) return '';
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export function ApprovalSnapshotView({
  task,
  review,
  detectedFields,
}: ApprovalSnapshotViewProps) {
  const isApproved = task.status === 'APPROVED_FOR_FILLING';
  const isReady = review?.ready ?? false;
  const fields = review?.snapshot?.fields || [];
  const approvedFieldsCount = fields.filter(
    (f) => f.fieldValues?.[0]?.status === 'APPROVED',
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Status Card */}
      <div className="p-4 bg-card border border-divider rounded-xl shadow-2xs flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isApproved
                  ? 'bg-success/15 text-success'
                  : isReady
                  ? 'bg-accent/15 text-accent'
                  : 'bg-warning/15 text-warning'
              }`}
            >
              {isApproved ? (
                <CheckCircle2 className="w-5 h-5 stroke-[2]" />
              ) : (
                <ShieldCheck className="w-5 h-5 stroke-[2]" />
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text-primary">
                Ready for Browser Execution
              </h3>
              <p className="text-[11px] text-text-secondary mt-0.5">
                Task Version: {task.version} • {approvedFieldsCount} of {fields.length} field{fields.length === 1 ? '' : 's'} prepared
              </p>
            </div>
          </div>
        </div>

        {/* Notice on safety boundary */}
        <p className="text-[10px] text-text-placeholder leading-normal pt-2 border-t border-divider/60">
          Security Boundary: Final authorization only permits browser extension filling of approved values into form inputs. It does NOT authorize or perform form submission on the webpage.
        </p>
      </div>

      {/* Browser Execution Panel (Active when task is approved for filling) */}
      {isApproved && (
        <BrowserExecutionPanel task={task} fields={detectedFields} />
      )}

      {/* Snapshot Fields Table / Summary */}
      {fields.length > 0 && (
        <div className="bg-card border border-divider rounded-xl overflow-hidden shadow-2xs">
          <div className="px-3.5 py-2.5 bg-page-bg border-b border-divider text-xs font-semibold text-text-primary">
            Snapshot Values ({fields.length} fields)
          </div>
          <div className="divide-y divide-divider/60 max-h-80 overflow-y-auto">
            {fields.map((f) => {
              const val = f.fieldValues?.[0];
              const status = val?.status;

              return (
                <div key={f.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-text-primary block truncate">
                      {f.label || f.fieldIdentifier}
                    </span>
                    <span className="text-[10px] text-text-secondary truncate block">
                      {f.fieldIdentifier}
                    </span>
                  </div>

                  <div className="text-right min-w-0 max-w-[50%]">
                    <span className="font-semibold text-text-primary truncate block">
                      {val ? stringifyValue(val.value) : '—'}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase ${
                        status === 'APPROVED'
                          ? 'text-success'
                          : status === 'REJECTED'
                          ? 'text-danger'
                          : 'text-warning'
                      }`}
                    >
                      {status || 'MISSING'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

