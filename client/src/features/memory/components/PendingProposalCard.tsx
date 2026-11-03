import { useState } from 'react';
import { Check, X, Loader2, ArrowRight } from 'lucide-react';
import type { MemoryProposal } from '../types/memory.types';

interface PendingProposalCardProps {
  proposal: MemoryProposal;
  isProcessing: boolean;
  onApprove: (proposalId: string) => Promise<void>;
  onReject: (proposalId: string, reason?: string) => Promise<void>;
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

export function PendingProposalCard({
  proposal,
  isProcessing,
  onApprove,
  onReject,
}: PendingProposalCardProps) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isPending = proposal.status === 'PENDING';
  const isApproved = proposal.status === 'APPROVED';
  const isRejected = proposal.status === 'REJECTED';

  const operationBadge = () => {
    switch (proposal.operation) {
      case 'CREATE':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent uppercase tracking-wider">
            New Memory
          </span>
        );
      case 'UPDATE':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning uppercase tracking-wider">
            Update Memory
          </span>
        );
      case 'DELETE':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/10 text-danger uppercase tracking-wider">
            Delete Memory
          </span>
        );
    }
  };

  const handleConfirmReject = async () => {
    await onReject(proposal.id, rejectReason.trim() ? rejectReason.trim() : undefined);
    setShowRejectForm(false);
  };

  return (
    <div className="bg-card border border-divider rounded-xl p-3.5 shadow-2xs hover:border-divider/80 transition-all flex flex-col gap-3">
      {/* Header: Operation & Category */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {operationBadge()}
          <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider px-1.5 py-0.5 rounded bg-page-bg">
            {proposal.category}
          </span>
        </div>

        {/* Status indicator if not pending */}
        {!isPending && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
              isApproved
                ? 'bg-success/15 text-success'
                : 'bg-text-placeholder/15 text-text-secondary'
            }`}
          >
            {proposal.status}
          </span>
        )}
      </div>

      {/* Key & Value Content */}
      <div className="min-w-0">
        <span className="text-[11px] font-medium text-text-secondary capitalize block truncate">
          {proposal.proposedKey.replace(/_/g, ' ')}
        </span>

        {proposal.operation === 'UPDATE' && proposal.previousValue !== undefined ? (
          <div className="mt-1.5 flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg bg-page-bg border border-divider text-xs">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium text-text-secondary block">
                Current value:
              </span>
              <p className="text-text-placeholder line-through truncate break-words">
                {formatValue(proposal.previousValue)}
              </p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-text-placeholder hidden sm:block shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium text-text-secondary block">
                Proposed value:
              </span>
              <p className="font-semibold text-text-primary break-words whitespace-pre-wrap">
                {formatValue(proposal.proposedValue)}
              </p>
            </div>
          </div>
        ) : proposal.operation === 'DELETE' ? (
          <div className="mt-1.5 p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs">
            <span className="text-[10px] font-medium text-danger block">
              Memory requested for deletion:
            </span>
            <p className="font-semibold text-text-primary mt-0.5 break-words">
              {formatValue(proposal.proposedValue)}
            </p>
          </div>
        ) : (
          <p className="text-xs font-semibold text-text-primary mt-1 break-words whitespace-pre-wrap">
            {formatValue(proposal.proposedValue)}
          </p>
        )}
      </div>

      {/* Rejection Reason if rejected */}
      {isRejected && proposal.rejectionReason && (
        <div className="text-[11px] text-text-secondary bg-page-bg p-2 rounded-lg border border-divider">
          <span className="font-medium text-text-primary">Reason: </span>
          {proposal.rejectionReason}
        </div>
      )}

      {/* Action Buttons for Pending Proposals */}
      {isPending && (
        <div className="pt-2 border-t border-divider/60">
          {showRejectForm ? (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Reason for rejecting (optional)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
                className="w-full h-7 px-2 text-xs bg-input-bg border border-divider rounded text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-accent"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowRejectForm(false)}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-[11px] rounded bg-page-bg text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmReject()}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-[11px] font-medium rounded bg-danger text-white hover:bg-danger/90 transition-colors shadow-2xs flex items-center gap-1"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                  <span>Confirm Reject</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRejectForm(true)}
                disabled={isProcessing}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-divider text-xs font-medium text-text-secondary hover:text-danger hover:border-danger/30 hover:bg-danger/5 transition-all disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>

              <button
                type="button"
                onClick={() => void onApprove(proposal.id)}
                disabled={isProcessing}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-all shadow-xs active:scale-[0.98] disabled:opacity-40"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Approve</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
