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
      setError(err instanceof Error ? err.message : 'Failed to update memory');
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
        <div className="px-5 py-3.5 border-b border-divider flex items-center justify-between">
          <h3 id="edit-memory-title" className="text-sm font-bold text-[#102A24]">
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
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          {error && (
            <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">
              {error}
            </div>
          )}

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
              className="w-full h-9 px-3 text-xs bg-input-bg border border-divider rounded-xl text-text-primary focus:outline-none focus:border-[#102A24]"
            >
              {MEMORY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="edit-key"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Key / Title
            </label>
            <input
              id="edit-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-input-bg border border-divider rounded-xl text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-[#102A24]"
            />
          </div>

          <div>
            <label
              htmlFor="edit-value"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Content / Value
            </label>
            <textarea
              id="edit-value"
              rows={4}
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              className="w-full p-3 text-xs bg-input-bg border border-divider rounded-xl text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-[#102A24] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-medium text-text-secondary hover:text-text-primary rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#102A24] hover:bg-[#17483A] text-white rounded-full transition-all shadow-xs disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
