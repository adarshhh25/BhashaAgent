import { ShieldCheck, AlertCircle, X, ArrowRight } from 'lucide-react';
import type { FormTask, DetectedField } from '../../forms/types/form.types';

interface FillConfirmationModalProps {
  task: FormTask;
  fields?: DetectedField[];
  isOpen: boolean;
  isExecuting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function FillConfirmationModal({
  task,
  fields = [],
  isOpen,
  isExecuting,
  onConfirm,
  onClose,
}: FillConfirmationModalProps) {
  if (!isOpen) return null;

  const approvedFields = fields.filter(
    (f) => f.fieldValues?.[0]?.status === 'APPROVED',
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs animate-fade-in">
      <div className="bg-card border border-divider rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-divider flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-primary">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Authorize Form Filling</h3>
              <p className="text-[11px] text-text-secondary">Explicit Human-in-the-Loop Confirmation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="p-1 rounded-lg text-text-placeholder hover:text-text-primary hover:bg-page-bg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          <div className="p-3 bg-page-bg border border-divider/60 rounded-xl text-xs flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-text-secondary text-[11px]">
              <span>Form Task:</span>
              <span className="font-medium text-text-primary truncate max-w-[200px]">
                {task.title || task.domain || 'Form Task'}
              </span>
            </div>
            <div className="flex justify-between items-center text-text-secondary text-[11px]">
              <span>Fields to Fill:</span>
              <span className="font-semibold text-text-primary">
                {approvedFields.length} approved fields
              </span>
            </div>
          </div>

          {/* Field Preview List */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-text-secondary uppercase">
              Approved Fields Preview:
            </span>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
              {approvedFields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between text-xs p-2 bg-card border border-divider/50 rounded-lg"
                >
                  <span className="text-text-primary font-medium truncate max-w-[150px]">
                    {f.label || f.fieldIdentifier}
                  </span>
                  <span className="text-text-secondary truncate max-w-[160px] text-[11px]">
                    {String(f.fieldValues?.[0]?.value ?? '')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Safety Notice Banner */}
          <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl text-warning text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 leading-normal">
              <span className="font-semibold">Safety Boundary: Filling Only</span>
              <p className="text-[11px] text-warning/90">
                BhashaAgent will populate the approved values into the webpage inputs. It will <strong>NEVER</strong> automatically submit the form. You remain in complete control and must review and submit the webpage manually.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-divider bg-page-bg/50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isExecuting}
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-divider text-xs text-text-secondary hover:text-text-primary hover:bg-card transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExecuting || approvedFields.length === 0}
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-all shadow-xs disabled:opacity-40"
          >
            <span>Proceed to Fill</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
