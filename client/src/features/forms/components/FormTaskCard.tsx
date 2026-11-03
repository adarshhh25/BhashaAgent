import { Globe, Clock } from 'lucide-react';
import type { FormTask } from '../types/form.types';
import { FormTaskStatusBadge } from './FormEmptyState';

interface FormTaskCardProps {
  task: FormTask;
  isActive: boolean;
  onSelect: (taskId: string) => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function FormTaskCard({ task, isActive, onSelect }: FormTaskCardProps) {
  const displayTitle = task.title || task.webpageTitle || 'Webpage Form Task';
  const timeDisplay = formatRelativeTime(task.updatedAt || task.createdAt);
  const detectedCount = task._count?.detectedFields;

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={`w-full text-left p-3 rounded-xl transition-all border flex flex-col gap-2 ${
        isActive
          ? 'bg-card border-accent shadow-xs'
          : 'bg-card border-divider hover:border-divider/80 shadow-2xs'
      }`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-text-primary block truncate">
            {displayTitle}
          </span>
          <div className="flex items-center gap-1 text-[10px] text-text-secondary mt-0.5 truncate">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{task.webpageUrl}</span>
          </div>
        </div>

        <div className="shrink-0">
          <FormTaskStatusBadge status={task.status} />
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-text-placeholder pt-1.5 border-t border-divider/60 w-full">
        <span>
          {typeof detectedCount === 'number'
            ? `${detectedCount} fields detected`
            : 'Detected fields'}
        </span>
        {timeDisplay && (
          <span className="flex items-center gap-1 shrink-0">
            <Clock className="w-2.5 h-2.5" />
            <span>{timeDisplay}</span>
          </span>
        )}
      </div>
    </button>
  );
}

