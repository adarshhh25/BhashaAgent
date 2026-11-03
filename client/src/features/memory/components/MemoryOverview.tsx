import { BookmarkCheck, Clock, ShieldCheck, Plus } from 'lucide-react';

interface MemoryOverviewProps {
  approvedCount: number;
  pendingCount: number;
  onOpenCreateModal: () => void;
}

export function MemoryOverview({
  approvedCount,
  pendingCount,
  onOpenCreateModal,
}: MemoryOverviewProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Top Banner & Info */}
      <div className="bg-card border border-divider rounded-xl p-3.5 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-text-primary leading-tight">
                Profile Memory
              </h2>
              <p className="text-[11px] text-text-secondary mt-0.5 leading-tight">
                BhashaAgent only remembers facts you explicitly approve.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-accent text-white text-[11px] font-medium hover:bg-accent/90 transition-all shadow-xs active:scale-[0.98] shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Memory</span>
          </button>
        </div>
      </div>

      {/* Counts Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-card border border-divider rounded-xl p-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
              <BookmarkCheck className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <span className="text-[10px] text-text-secondary font-medium block">
                Approved
              </span>
              <span className="text-sm font-bold text-text-primary leading-none">
                {approvedCount}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-divider rounded-xl p-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <span className="text-[10px] text-text-secondary font-medium block">
                Pending
              </span>
              <span className="text-sm font-bold text-text-primary leading-none">
                {pendingCount}
              </span>
            </div>
          </div>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-warning/15 text-warning">
              Review
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

