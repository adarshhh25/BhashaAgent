import { type ReactNode } from 'react';
import { Bookmark } from 'lucide-react';

interface MemoryEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function MemoryEmptyState({
  icon,
  title,
  description,
  action,
}: MemoryEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-xl border border-divider shadow-2xs">
      <div className="w-12 h-12 rounded-2xl bg-page-bg text-text-placeholder flex items-center justify-center mb-3">
        {icon ?? <Bookmark className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <h3 className="text-xs font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-[11px] text-text-secondary max-w-xs mb-4 leading-relaxed">
        {description}
      </p>
      {action}
    </div>
  );
}

export function MemoryLoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="p-4 bg-card rounded-xl border border-divider animate-pulse flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 bg-page-bg rounded-md" />
            <div className="h-4 w-16 bg-page-bg rounded-md" />
          </div>
          <div className="h-5 w-48 bg-page-bg rounded-md" />
          <div className="h-3 w-32 bg-page-bg rounded-md mt-1" />
        </div>
      ))}
    </div>
  );
}
