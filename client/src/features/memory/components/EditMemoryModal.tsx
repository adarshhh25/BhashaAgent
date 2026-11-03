import { useState, type FormEvent } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import {
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type ProfileMemory,
  type UpdateMemoryRequest,
} from '../types/memory.types';

interface EditMemoryModalProps {
  memory: ProfileMemory;
  isOpen: boolean;
  onClose: () => void;
  onSave: (memoryId: string, input: UpdateMemoryRequest) => Promise<void>;
}

function stringifyValue(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function EditMemoryModal({
  memory,
  isOpen,
  onClose,
  onSave,
}: EditMemoryModalProps) {
  const [category, setCategory] = useState<MemoryCategory>(memory.category);
  const [key, setKey] = useState(memory.key);
  const [valueDraft, setValueDraft] = useState(stringifyValue(memory.value));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedVal = valueDraft.trim();
    const trimmedKey = key.trim();

    if (!trimmedKey) {
      setError('Memory key cannot be empty');
      return;
    }
    if (!trimmedVal) {
      setError('Memory value cannot be empty');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      let parsedValue: unknown = trimmedVal;
      // Try parsing JSON if it looks like JSON array or object
      if (
        (trimmedVal.startsWith('{') && trimmedVal.endsWith('}')) ||
        (trimmedVal.startsWith('[') && trimmedVal.endsWith(']'))
      ) {
        try {
          parsedValue = JSON.parse(trimmedVal);
        } catch {
          parsedValue = trimmedVal;
        }
      }

      await onSave(memory.id, {
        category,
        key: trimmedKey,
        proposedValue: parsedValue as string | number | boolean | Record<string, unknown> | unknown[],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create edit proposal');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-memory-title"
        className="bg-card w-full max-w-sm rounded-2xl border border-divider shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-divider flex items-center justify-between">
          <h3 id="edit-memory-title" className="text-xs font-semibold text-text-primary">
            Edit Memory
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-text-placeholder hover:text-text-primary hover:bg-page-bg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          {error && (
            <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
              {error}
            </div>
          )}

          {/* Category */}
          <div>
            <label
              htmlFor="edit-category"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Category
            </label>
            <select
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as MemoryCategory)}
              className="w-full h-8 px-2 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              {MEMORY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Key */}
          <div>
            <label
              htmlFor="edit-key"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Key
            </label>
            <input
              id="edit-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full h-8 px-2.5 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Value */}
          <div>
            <label
              htmlFor="edit-value"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Value (Supports Unicode / हिन्दी / मराठी)
            </label>
            <textarea
              id="edit-value"
              rows={3}
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              className="w-full p-2.5 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <p className="text-[10px] text-text-placeholder leading-normal">
            Note: Editing an approved memory creates an Update Proposal. Review and approve it under
            Pending Proposals to commit the change.
          </p>

          {/* Actions */}
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
              <span>Propose Update</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

