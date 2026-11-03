import { AlertCircle, Check, Pencil } from 'lucide-react';
import type { DetectedField, FormIntelligenceResult } from '../types/form.types';

interface ConflictResolutionPanelProps {
  mappingResult: FormIntelligenceResult | null;
  fields: DetectedField[];
  onCorrectField: (field: DetectedField) => void;
}

export function ConflictResolutionPanel({
  mappingResult,
  fields,
  onCorrectField,
}: ConflictResolutionPanelProps) {
  const conflictingResults = mappingResult?.results?.filter(
    (r) => r.status === 'conflict' || (r.conflicts && r.conflicts.length > 0),
  ) || [];

  if (conflictingResults.length === 0) {
    return (
      <div className="p-4 bg-card border border-divider rounded-xl text-center flex flex-col items-center justify-center gap-1.5 shadow-2xs">
        <div className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center mb-1">
          <Check className="w-4 h-4 stroke-[2.5]" />
        </div>
        <span className="text-xs font-semibold text-text-primary">
          No conflicting information detected
        </span>
        <p className="text-[11px] text-text-secondary max-w-xs">
          All mapped fields have unambiguous sources or verified user values.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl flex items-center gap-2 text-warning text-xs">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="font-semibold">
          {conflictingResults.length} Field {conflictingResults.length === 1 ? 'Conflict' : 'Conflicts'} Detected
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {conflictingResults.map((result) => {
          const matchedField = fields.find((f) => f.id === result.fieldId);

          return (
            <div
              key={result.fieldId}
              className="p-3.5 bg-card border border-divider rounded-xl shadow-2xs flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-text-primary">
                    {result.label || result.fieldIdentifier}
                  </h4>
                  <span className="text-[10px] text-text-placeholder font-mono">
                    {result.fieldIdentifier}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning uppercase tracking-wider">
                  Conflict
                </span>
              </div>

              <p className="text-[11px] text-text-secondary leading-normal">
                {result.reason || 'Multiple candidate values were found from different sources.'}
              </p>

              {matchedField && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => onCorrectField(matchedField)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-all shadow-xs"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Resolve Conflict</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

