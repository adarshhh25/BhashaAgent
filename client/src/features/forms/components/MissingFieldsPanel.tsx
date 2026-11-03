import { AlertTriangle, Plus, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DetectedField, MissingInformationResult } from '../types/form.types';

interface MissingFieldsPanelProps {
  missingInfo: MissingInformationResult | null;
  onProvideValue: (field: DetectedField) => void;
}

export function MissingFieldsPanel({
  missingInfo,
  onProvideValue,
}: MissingFieldsPanelProps) {
  const navigate = useNavigate();

  if (!missingInfo) return null;

  const required = missingInfo.missingRequiredFields || [];
  const optional = missingInfo.missingOptionalFields || [];

  if (required.length === 0 && optional.length === 0) {
    return (
      <div className="p-4 bg-success/10 border border-success/30 rounded-xl text-success text-xs flex items-center gap-2">
        <span className="font-semibold">All information provided!</span>
        <span>Every field in this form has a value.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Required Missing Alert */}
      {required.length > 0 && (
        <div className="p-3.5 bg-danger/5 border border-danger/20 rounded-xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold">
                {required.length} Required {required.length === 1 ? 'Field' : 'Fields'} Missing
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              <MessageSquare className="w-3 h-3" />
              <span>Ask in Chat</span>
            </button>
          </div>

          <p className="text-[11px] text-text-secondary leading-normal">
            These fields must be filled before the form can be approved for filling.
          </p>

          <div className="flex flex-col gap-1.5 pt-1">
            {required.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between p-2 rounded-lg bg-card border border-divider text-xs"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-semibold text-text-primary block truncate">
                    {field.label || field.fieldIdentifier}
                  </span>
                  <span className="text-[10px] text-text-placeholder font-mono block truncate">
                    {field.fieldIdentifier}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onProvideValue(field)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-white text-[11px] font-medium hover:bg-accent/90 shrink-0 shadow-2xs"
                >
                  <Plus className="w-3 h-3" />
                  <span>Enter</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Missing */}
      {optional.length > 0 && (
        <div className="p-3.5 bg-card border border-divider rounded-xl flex flex-col gap-2">
          <span className="text-xs font-semibold text-text-secondary">
            {optional.length} Optional {optional.length === 1 ? 'Field' : 'Fields'} Without Values
          </span>
          <div className="flex flex-col gap-1.5">
            {optional.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between p-2 rounded-lg bg-page-bg border border-divider/60 text-xs"
              >
                <span className="text-text-primary truncate pr-2">
                  {field.label || field.fieldIdentifier}
                </span>
                <button
                  type="button"
                  onClick={() => onProvideValue(field)}
                  className="text-[11px] font-medium text-accent hover:underline shrink-0"
                >
                  Provide
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

