import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  MemoryPagination,
  MemoryProposal,
} from '../types/memory.types';
import { PendingProposalCard } from './PendingProposalCard';
import { MemoryEmptyState, MemoryLoadingState } from './MemoryEmptyState';

interface PendingProposalListProps {
  proposals: MemoryProposal[];
  pagination: MemoryPagination | null;
  isLoading: boolean;
  statusFilter: 'PENDING' | 'APPROVED' | 'REJECTED';
  onStatusFilterChange: (status: 'PENDING' | 'APPROVED' | 'REJECTED') => void;
  page: number;
  onPageChange: (newPage: number) => void;
  processingIds: Set<string>;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}

export function PendingProposalList({
  proposals,
  pagination,
  isLoading,
  statusFilter,
  onStatusFilterChange,
  page,
  onPageChange,
  processingIds,
  onApprove,
  onReject,
}: PendingProposalListProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Status Filter Tabs */}
      <div className="flex gap-1 p-1 bg-page-bg border border-divider rounded-xl">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatusFilterChange(status)}
            className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all capitalize ${
              statusFilter === status
                ? 'bg-card text-text-primary shadow-2xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {status.toLowerCase()}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <MemoryLoadingState />
      ) : proposals.length === 0 ? (
        <MemoryEmptyState
          title={`No ${statusFilter.toLowerCase()} proposals`}
          description={
            statusFilter === 'PENDING'
              ? 'There are no pending memory proposals to review. BhashaAgent will suggest profile memories as you converse.'
              : `There are no ${statusFilter.toLowerCase()} proposals in your history.`
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {proposals.map((proposal) => (
            <PendingProposalCard
              key={proposal.id}
              proposal={proposal}
              isProcessing={processingIds.has(proposal.id)}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-divider text-xs text-text-secondary">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  className="p-1.5 rounded bg-card border border-divider hover:bg-page-bg disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => onPageChange(page + 1)}
                  className="p-1.5 rounded bg-card border border-divider hover:bg-page-bg disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

