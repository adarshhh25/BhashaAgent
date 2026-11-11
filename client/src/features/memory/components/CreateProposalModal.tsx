import { useState, type FormEvent } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import {
  MEMORY_CATEGORIES,
  type CreateProposalRequest,
  type MemoryCategory,
} from '../types/memory.types';

interface CreateProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateProposalRequest) => Promise<void>;
}

export function CreateProposalModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateProposalModalProps) {
  const [category, setCategory] = useState<MemoryCategory>('PERSONAL');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedKey = key.trim();
    const trimmedVal = value.trim();

    if (!trimmedKey) {
      setError('Memory key or title is required');
      return;
    }
    if (!trimmedVal) {
      setError('Memory content is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        operation: 'CREATE',
        category,
        key: trimmedKey,
        proposedValue: trimmedVal,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save memory');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-memory-title"
        className="bg-card w-full max-w-sm rounded-2xl border border-divider shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="px-5 py-3.5 border-b border-divider flex items-center justify-between">
          <h3 id="create-memory-title" className="text-sm font-bold text-[#102A24]">
            Add Memory
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

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          {error && (
            <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="create-category"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Category
            </label>
            <select
              id="create-category"
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
              htmlFor="create-key"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Title / Key
            </label>
            <input
              id="create-key"
              type="text"
              placeholder="e.g. Explanation Style, Degree, Address..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-input-bg border border-divider rounded-xl text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-[#102A24]"
            />
          </div>

          <div>
            <label
              htmlFor="create-value"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Content / Value
            </label>
            <textarea
              id="create-value"
              rows={4}
              placeholder="Enter personal context, preference, or instructions..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full p-3 text-xs bg-input-bg border border-divider rounded-xl text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-[#102A24] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-medium text-text-secondary hover:text-text-primary rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#102A24] hover:bg-[#17483A] text-white rounded-full transition-all shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Save Memory</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
