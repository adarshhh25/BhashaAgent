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
      setError(err instanceof Error ? err.message : 'Failed to delete memory');
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
            <h3 id="delete-memory-title" className="text-sm font-bold text-[#102A24]">
              Delete Memory
            </h3>
            <p className="text-xs text-text-secondary mt-1 leading-normal">
              Are you sure you want to delete this profile memory? This will remove it from the assistant's context.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">
            {error}
          </div>
        )}

        {/* Memory Details Snapshot */}
        <div className="p-3.5 rounded-xl bg-[#F7F6F1] border border-divider flex flex-col gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#252923] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#ECEAE3]">
              {memory.category.toLowerCase()}
            </span>
            <span className="font-bold text-[#102A24] capitalize truncate">
              {memory.key.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-[#252923]/90 mt-1 break-words line-clamp-3">
            {typeof memory.value === 'string' ? memory.value : JSON.stringify(memory.value)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3.5 py-2 text-xs font-medium text-text-secondary hover:text-text-primary rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-danger text-white rounded-full hover:bg-danger/90 transition-all shadow-xs disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
