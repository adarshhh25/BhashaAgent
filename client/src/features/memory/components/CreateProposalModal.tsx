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
    const trimmedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    const trimmedVal = value.trim();

    if (!trimmedKey) {
      setError('Key is required');
      return;
    }
    if (!trimmedVal) {
      setError('Value is required');
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
      setError(err instanceof Error ? err.message : 'Failed to create memory proposal');
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
        <div className="px-4 py-3 border-b border-divider flex items-center justify-between">
          <h3 id="create-memory-title" className="text-xs font-semibold text-text-primary">
            Add New Memory Proposal
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

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          {error && (
            <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
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
              className="w-full h-8 px-2 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              {MEMORY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="create-key"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Fact Name / Key (e.g. current_city, employer)
            </label>
            <input
              id="create-key"
              type="text"
              placeholder="e.g. highest_qualification"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full h-8 px-2.5 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent placeholder:text-text-placeholder"
            />
          </div>

          <div>
            <label
              htmlFor="create-value"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Value (Supports English / हिन्दी / मराठी / Hinglish)
            </label>
            <textarea
              id="create-value"
              rows={3}
              placeholder="e.g. B.Tech Computer Science"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full p-2.5 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent resize-none placeholder:text-text-placeholder"
            />
          </div>

          <p className="text-[10px] text-text-placeholder leading-normal">
            New memories are proposed first. You can immediately review and approve it under Pending Proposals.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-all shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Create Proposal</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

