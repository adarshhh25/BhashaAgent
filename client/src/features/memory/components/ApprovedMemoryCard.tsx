import { Pencil, Trash2 } from 'lucide-react';
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

function formatStitchDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return '';
  }
}

function formatKey(key: string): string {
  if (!key) return '';
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ApprovedMemoryCard({
  memory,
  onEdit,
  onDelete,
  isProcessing = false,
}: ApprovedMemoryCardProps) {
  const formattedValue = formatValue(memory.value);
  const formattedDate = formatStitchDate(memory.updatedAt || memory.approvedAt || memory.createdAt);
  const formattedTitle = formatKey(memory.key);

  return (
    <div className="bg-card border border-divider rounded-2xl p-4 shadow-2xs hover:border-[#102A24]/30 transition-all flex flex-col gap-2.5">
      {/* Top Row: Category Badge + Key/Title + Action Buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#ECEAE3] text-[#252923] shrink-0 capitalize">
            {memory.category.toLowerCase()}
          </span>
          <h4 className="font-bold text-xs sm:text-sm text-[#102A24] truncate tracking-tight">
            {formattedTitle}
          </h4>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(memory)}
            disabled={isProcessing}
            title="Edit memory"
            className="p-1 rounded-md text-[#7B8278] hover:text-[#102A24] hover:bg-[#F0EDE6] transition-colors disabled:opacity-40"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(memory)}
            disabled={isProcessing}
            title="Delete memory"
            className="p-1 rounded-md text-[#7B8278] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Middle: Content */}
      <div className="min-w-0">
        <p className="text-xs sm:text-[13px] text-[#252923]/90 leading-relaxed break-words whitespace-pre-wrap">
          {formattedValue}
        </p>
      </div>

      {/* Bottom: Hairline divider & Date */}
      {formattedDate && (
        <div className="border-t border-divider/60 pt-2 mt-0.5">
          <span className="text-[11px] font-normal text-[#7B8278]">
            Updated {formattedDate}
          </span>
        </div>
      )}
    </div>
  );
}
