import { Pencil, X, Loader2 } from 'lucide-react';
import type { DetectedField } from '../types/form.types';
import { FieldConfidenceIndicator } from './FieldConfidenceIndicator';
import { FieldSourceIndicator } from './FieldSourceIndicator';

interface FormFieldCardProps {
  field: DetectedField;
  isProcessing: boolean;
  onEdit: (field: DetectedField) => void;
  onApprove?: (fieldId: string) => Promise<void>;
  onReject: (fieldId: string) => Promise<void>;
}

function stringifyValue(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val === null || val === undefined) return '';
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function FormFieldCard({
  field,
  isProcessing,
  onEdit,
  onReject,
}: FormFieldCardProps) {
  const currentValueRecord = field.fieldValues?.[0];
  const valueDisplay = currentValueRecord ? stringifyValue(currentValueRecord.value) : '';
  const hasValue = Boolean(valueDisplay);

  const getStatusBadge = () => {
    if (!hasValue) {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-page-bg text-text-placeholder border border-divider">
          Missing
        </span>
      );
    }
    if (currentValueRecord?.executionStatus === 'FILLED') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success">
          Filled
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
        Ready
      </span>
    );
  };

  return (
    <div className="bg-card border border-divider rounded-xl p-3.5 shadow-2xs hover:border-divider/80 transition-all flex flex-col justify-between gap-2.5">
      {/* Header: Label, Required flag, Status Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-text-primary break-words">
              {field.label || field.fieldIdentifier}
            </span>
            {field.isRequired && (
              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-danger/10 text-danger uppercase">
                Required
              </span>
            )}
          </div>
          <span className="text-[10px] text-text-placeholder block truncate font-mono mt-0.5">
            {field.fieldIdentifier} • {field.inputType || field.elementType}
          </span>
        </div>

        <div className="shrink-0">{getStatusBadge()}</div>
      </div>

      {/* Field Value Display */}
      <div className="p-2.5 rounded-lg bg-page-bg border border-divider/70 min-w-0">
        {hasValue ? (
          <p className="text-xs font-medium text-text-primary break-words whitespace-pre-wrap">
            {valueDisplay}
          </p>
        ) : (
          <p className="text-xs italic text-text-placeholder">
            No value mapped yet.
          </p>
        )}
      </div>

      {/* Footer: Provenance, Confidence, and Action buttons */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-divider/60 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {currentValueRecord && (
            <>
              <FieldSourceIndicator source={currentValueRecord.source} />
              <FieldConfidenceIndicator confidence={currentValueRecord.confidence} />
            </>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {/* Edit / Provide Value button */}
          <button
            type="button"
            onClick={() => onEdit(field)}
            disabled={isProcessing}
            title={hasValue ? 'Edit field value' : 'Provide field value'}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors disabled:opacity-40"
          >
            <Pencil className="w-3 h-3" />
            <span>{hasValue ? 'Edit' : 'Provide'}</span>
          </button>

          {/* Reject / Clear button */}
          {hasValue && (
            <button
              type="button"
              onClick={() => void onReject(field.id)}
              disabled={isProcessing}
              title="Clear field value"
              className="p-1 rounded-md text-text-placeholder hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

