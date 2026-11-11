import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RotateCw,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useMemories } from '../hooks/useMemories';
import { useMemoryProposals } from '../hooks/useMemoryProposals';
import { ApprovedMemoryList } from './ApprovedMemoryList';
import { PendingProposalList } from './PendingProposalList';
import { EditMemoryModal } from './EditMemoryModal';
import { DeleteMemoryDialog } from './DeleteMemoryDialog';
import { CreateProposalModal } from './CreateProposalModal';
import { memoryService } from '../services/memory.service';
import type {
  CreateProposalRequest,
  ProfileMemory,
  UpdateMemoryRequest,
} from '../types/memory.types';

type DashboardView = 'APPROVED' | 'PENDING';

export function MemoryDashboard() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<DashboardView>('APPROVED');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    memories,
    pagination: memoryPagination,
    isLoading: isLoadingMemories,
    error: memoryError,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    page: memoryPage,
    setPage: setMemoryPage,
    fetchMemories,
  } = useMemories();

  const {
    proposals,
    pagination: proposalPagination,
    isLoading: isLoadingProposals,
    error: proposalError,
    statusFilter,
    setStatusFilter,
    page: proposalPage,
    setPage: setProposalPage,
    processingIds,
    fetchProposals,
    approveProposal,
    rejectProposal,
  } = useMemoryProposals();

  // Modals state
  const [editingMemory, setEditingMemory] = useState<ProfileMemory | null>(null);
  const [deletingMemory, setDeletingMemory] = useState<ProfileMemory | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Feedback banner state
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  };

  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchMemories(), fetchProposals()]);
      showFeedback('success', 'Profile memory refreshed');
    } catch (err) {
      showFeedback('error', 'Failed to refresh memories');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchMemories, fetchProposals]);

  // AI-generated pending proposal review
  const handleApproveProposal = async (proposalId: string) => {
    try {
      await approveProposal(proposalId);
      await fetchMemories();
      showFeedback('success', 'Memory proposal approved');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  };

  const handleRejectProposal = async (proposalId: string, reason?: string) => {
    try {
      await rejectProposal(proposalId, reason);
      showFeedback('success', 'Memory proposal rejected');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  /**
   * Direct Memory Operations:
   * When user manually adds, edits, or deletes a memory from the UI,
   * we create the proposal and immediately approve it so it is directly
   * finalized into approved ProfileMemory without requiring an extra review step.
   */
  const handleCreateMemoryDirect = async (input: CreateProposalRequest) => {
    try {
      // 1. Create proposal
      const proposal = await memoryService.createProposal(input);
      // 2. Immediately approve to write into ProfileMemory
      await memoryService.approveProposal(proposal.id);
      // 3. Re-fetch approved memories & pending proposals
      await Promise.all([fetchMemories(), fetchProposals()]);
      showFeedback('success', 'Memory saved successfully');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to save memory');
      throw err;
    }
  };

  const handleSaveEditDirect = async (memoryId: string, input: UpdateMemoryRequest) => {
    try {
      // 1. Create edit proposal
      const proposal = await memoryService.editMemory(memoryId, input);
      // 2. Immediately approve update
      await memoryService.approveProposal(proposal.id);
      // 3. Re-fetch approved memories & pending proposals
      await Promise.all([fetchMemories(), fetchProposals()]);
      showFeedback('success', 'Memory updated successfully');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update memory');
      throw err;
    }
  };

  const handleConfirmDeleteDirect = async (memoryId: string) => {
    try {
      // 1. Create delete proposal
      const proposal = await memoryService.deleteMemory(memoryId);
      // 2. Immediately approve deletion
      await memoryService.approveProposal(proposal.id);
      // 3. Re-fetch approved memories & pending proposals
      await Promise.all([fetchMemories(), fetchProposals()]);
      showFeedback('success', 'Memory deleted successfully');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete memory');
      throw err;
    }
  };

  const pendingCount =
    proposalPagination?.total ??
    proposals.filter((p) => p.status === 'PENDING').length;

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F6F1]">
      {/* Top Navigation Bar (Stitch header) */}
      <header className="h-12 border-b border-divider bg-[#F7F6F1] px-4 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs text-[#7B8278] hover:text-[#102A24] transition-colors focus:outline-none"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium">Assistant</span>
          </button>
          <span className="text-[#7B8278]/60 font-light text-sm">/</span>
          <h1 className="text-xs sm:text-sm font-bold text-[#102A24] tracking-tight">
            Profile Memory
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setActiveView(activeView === 'PENDING' ? 'APPROVED' : 'PENDING')
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                activeView === 'PENDING'
                  ? 'bg-[#102A24] text-white'
                  : 'bg-amber-100/80 text-amber-900 hover:bg-amber-200/80'
              }`}
              title="Review pending memory proposals"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending ({pendingCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={isRefreshing}
            title="Refresh memory"
            className="p-1.5 rounded-lg text-[#7B8278] hover:text-[#102A24] hover:bg-black/5 transition-colors"
          >
            <RotateCw
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#102A24]' : ''}`}
            />
          </button>
        </div>
      </header>

      {/* Main Content Scrollable Area */}
      <main className="flex-1 p-3.5 sm:p-5 max-w-2xl mx-auto w-full flex flex-col gap-3.5">
        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div
            className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150 ${
              feedbackMessage.type === 'success'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-danger/10 border-danger/30 text-danger'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
        )}

        {/* Top Error States if load failed */}
        {(memoryError || proposalError) && (
          <div className="p-3 rounded-2xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{memoryError || proposalError}</span>
          </div>
        )}

        {/* Stitch Introduction Card */}
        {activeView === 'APPROVED' && (
          <div className="bg-card border border-divider rounded-2xl p-4 sm:p-5 shadow-2xs">
            <h2 className="text-base sm:text-lg font-bold text-[#102A24] tracking-tight">
              Profile Memory
            </h2>
            <div className="flex items-center justify-between gap-3 mt-1.5">
              <p className="text-xs sm:text-[13px] text-[#555C54] leading-relaxed max-w-[210px] sm:max-w-[270px]">
                Save personal context, preferences, and custom instructions to personalize every conversation.
              </p>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-[#102A24] hover:bg-[#17483A] text-white text-xs font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add Memory</span>
              </button>
            </div>
          </div>
        )}

        {/* Pending Proposals Notification Banner (if proposals exist in approved mode) */}
        {pendingCount > 0 && activeView === 'APPROVED' && (
          <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                You have <strong>{pendingCount}</strong> pending memory proposal{pendingCount > 1 ? 's' : ''} to review.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('PENDING')}
              className="px-3 py-1 bg-[#102A24] hover:bg-[#17483A] text-white rounded-full text-[11px] font-semibold transition-colors shrink-0"
            >
              Review
            </button>
          </div>
        )}

        {/* Pending Proposals Review View Banner */}
        {activeView === 'PENDING' && (
          <div className="flex items-center justify-between bg-card border border-divider rounded-2xl p-3.5 text-xs shadow-2xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#102A24]" />
              <span className="font-bold text-[#102A24]">
                Pending Proposals ({pendingCount})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('APPROVED')}
              className="text-xs font-semibold text-[#17483A] hover:underline"
            >
              ← Back to Approved Memories
            </button>
          </div>
        )}

        {/* Main Content Area */}
        {activeView === 'APPROVED' ? (
          <ApprovedMemoryList
            memories={memories}
            pagination={memoryPagination}
            isLoading={isLoadingMemories}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            page={memoryPage}
            onPageChange={setMemoryPage}
            onEdit={(m) => setEditingMemory(m)}
            onDelete={(m) => setDeletingMemory(m)}
            onOpenCreate={() => setIsCreateModalOpen(true)}
          />
        ) : (
          <PendingProposalList
            proposals={proposals}
            pagination={proposalPagination}
            isLoading={isLoadingProposals}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            page={proposalPage}
            onPageChange={setProposalPage}
            processingIds={processingIds}
            onApprove={handleApproveProposal}
            onReject={handleRejectProposal}
          />
        )}
      </main>

      {/* Edit Memory Modal */}
      {editingMemory && (
        <EditMemoryModal
          memory={editingMemory}
          isOpen={true}
          onClose={() => setEditingMemory(null)}
          onSave={handleSaveEditDirect}
        />
      )}

      {/* Delete Memory Confirmation Dialog */}
      {deletingMemory && (
        <DeleteMemoryDialog
          memory={deletingMemory}
          isOpen={true}
          onClose={() => setDeletingMemory(null)}
          onConfirm={handleConfirmDeleteDirect}
        />
      )}

      {/* Add Memory Modal */}
      <CreateProposalModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateMemoryDirect}
      />
    </div>
  );
}
