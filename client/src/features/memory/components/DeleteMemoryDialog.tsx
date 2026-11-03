import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import type { ProfileMemory } from '../types/memory.types';

interface DeleteMemoryDialogProps {
  memory: ProfileMemory;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (memoryId: string) => Promise<void>;
}

export function DeleteMemoryDialog({
  memory,
  isOpen,
  onClose,
  onConfirm,
}: DeleteMemoryDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(memory.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request memory deletion');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-memory-title"
        className="bg-card w-full max-w-sm rounded-2xl border border-divider shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-5 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-danger/10 text-danger flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <h3 id="delete-memory-title" className="text-sm font-semibold text-text-primary">
              Delete Profile Memory
            </h3>
            <p className="text-xs text-text-secondary mt-0.5 leading-normal">
              Are you sure you want to delete this memory? A deletion proposal will be created to finalize deletion.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
            {error}
          </div>
        )}

        {/* Memory Details Snapshot */}
        <div className="p-3 rounded-xl bg-page-bg border border-divider flex flex-col gap-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
              {memory.category}
            </span>
            <span className="text-[11px] font-medium text-text-secondary capitalize">
              {memory.key.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="font-semibold text-text-primary mt-1 break-words">
            {typeof memory.value === 'string' ? memory.value : JSON.stringify(memory.value)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-danger text-white rounded-lg hover:bg-danger/90 transition-all shadow-xs disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Confirm Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

