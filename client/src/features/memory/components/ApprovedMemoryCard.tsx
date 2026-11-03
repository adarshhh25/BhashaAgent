import { Pencil, Trash2, Calendar } from 'lucide-react';
import type { ProfileMemory } from '../types/memory.types';

interface ApprovedMemoryCardProps {
  memory: ProfileMemory;
  onEdit: (memory: ProfileMemory) => void;
  onDelete: (memory: ProfileMemory) => void;
  isProcessing?: boolean;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function ApprovedMemoryCard({
  memory,
  onEdit,
  onDelete,
  isProcessing = false,
}: ApprovedMemoryCardProps) {
  const formattedValue = formatValue(memory.value);
  const formattedDate = formatDate(memory.approvedAt || memory.updatedAt || memory.createdAt);

  return (
    <div className="bg-card border border-divider rounded-xl p-3.5 shadow-2xs hover:border-divider/80 transition-all flex flex-col justify-between gap-2.5">
      {/* Header: Category Badge & Actions */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent uppercase tracking-wider">
          {memory.category}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(memory)}
            disabled={isProcessing}
            title="Edit memory"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors disabled:opacity-40"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(memory)}
            disabled={isProcessing}
            title="Delete memory"
            className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-page-bg transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Key & Value */}
      <div className="min-w-0">
        <span className="text-[11px] font-medium text-text-secondary block capitalize truncate">
          {memory.key.replace(/_/g, ' ')}
        </span>
        <p className="text-xs font-semibold text-text-primary mt-0.5 break-words whitespace-pre-wrap">
          {formattedValue}
        </p>
      </div>

      {/* Footer: Date */}
      {formattedDate && (
        <div className="flex items-center gap-1.5 pt-1.5 border-t border-divider/60 text-[10px] text-text-placeholder">
          <Calendar className="w-3 h-3" />
          <span>Approved on {formattedDate}</span>
        </div>
      )}
    </div>
  );
}

