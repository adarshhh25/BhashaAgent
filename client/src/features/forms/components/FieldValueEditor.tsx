import { useState, type FormEvent } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import type { DetectedField } from '../types/form.types';

interface FieldValueEditorProps {
  field: DetectedField;
  isOpen: boolean;
  onClose: () => void;
  onSave: (fieldId: string, value: unknown) => Promise<void>;
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

export function FieldValueEditor({
  field,
  isOpen,
  onClose,
  onSave,
}: FieldValueEditorProps) {
  const currentValue = field.fieldValues?.[0]?.value;
  const [draftValue, setDraftValue] = useState(stringifyValue(currentValue));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draftValue.trim();

    if (field.isRequired && !trimmed) {
      setError('This field is required by the webpage');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      let finalValue: unknown = trimmed;
      if (field.inputType === 'number') {
        const parsed = Number(trimmed);
        if (!isNaN(parsed)) finalValue = parsed;
      }

      await onSave(field.id, finalValue);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update field value');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-field-title"
        className="bg-card w-full max-w-sm rounded-2xl border border-divider shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="px-4 py-3 border-b border-divider flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <h3 id="edit-field-title" className="text-xs font-semibold text-text-primary truncate">
              {field.label || field.fieldIdentifier}
            </h3>
            <span className="text-[10px] text-text-secondary truncate block">
              Identifier: {field.fieldIdentifier}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-text-placeholder hover:text-text-primary hover:bg-page-bg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          {error && (
            <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-page-bg text-text-secondary uppercase">
              Type: {field.inputType || field.elementType}
            </span>
            {field.isRequired && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger font-semibold">
                Required
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="field-value-input"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Field Value (Supports Unicode / हिन्दी / मराठी)
            </label>
            <textarea
              id="field-value-input"
              rows={3}
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              placeholder={`Enter value for ${field.label || field.fieldIdentifier}...`}
              className="w-full p-2.5 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent resize-none placeholder:text-text-placeholder"
              autoFocus
            />
          </div>

          <p className="text-[10px] text-text-placeholder leading-normal">
            Saving updates this field value with provenance marked as User Corrected.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-all shadow-xs disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save Value</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

