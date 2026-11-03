import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RotateCw,
  BookmarkCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useMemories } from '../hooks/useMemories';
import { useMemoryProposals } from '../hooks/useMemoryProposals';
import { MemoryOverview } from './MemoryOverview';
import { ApprovedMemoryList } from './ApprovedMemoryList';
import { PendingProposalList } from './PendingProposalList';
import { EditMemoryModal } from './EditMemoryModal';
import { DeleteMemoryDialog } from './DeleteMemoryDialog';
import { CreateProposalModal } from './CreateProposalModal';
import type {
  CreateProposalRequest,
  ProfileMemory,
  UpdateMemoryRequest,
} from '../types/memory.types';

type DashboardTab = 'APPROVED' | 'PENDING';

export function MemoryDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardTab>('APPROVED');

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
    editMemory,
    deleteMemory,
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
    createProposal,
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
    await Promise.all([fetchMemories(), fetchProposals()]);
    showFeedback('success', 'Profile memory refreshed');
  }, [fetchMemories, fetchProposals]);

  const handleApprove = async (proposalId: string) => {
    try {
      await approveProposal(proposalId);
      await fetchMemories();
      showFeedback('success', 'Memory proposal approved');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  };

  const handleReject = async (proposalId: string, reason?: string) => {
    try {
      await rejectProposal(proposalId, reason);
      showFeedback('success', 'Memory proposal rejected');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  const handleSaveEdit = async (memoryId: string, input: UpdateMemoryRequest) => {
    try {
      await editMemory(memoryId, input);
      await fetchProposals();
      showFeedback('success', 'Update proposal created! Review it under Pending Proposals.');
      setActiveTab('PENDING');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to propose memory update');
      throw err;
    }
  };

  const handleConfirmDelete = async (memoryId: string) => {
    try {
      await deleteMemory(memoryId);
      await fetchProposals();
      showFeedback('success', 'Deletion proposal created! Review it under Pending Proposals.');
      setActiveTab('PENDING');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to propose memory deletion');
      throw err;
    }
  };

  const handleCreateProposal = async (input: CreateProposalRequest) => {
    try {
      await createProposal(input);
      showFeedback('success', 'New memory proposal created! Review it under Pending Proposals.');
      setActiveTab('PENDING');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to create proposal');
      throw err;
    }
  };

  const approvedCount = memoryPagination?.total ?? memories.length;
  const pendingCount = proposalPagination?.total ?? proposals.filter((p) => p.status === 'PENDING').length;

  return (
    <div className="flex flex-col min-h-screen bg-page-bg">
      {/* Top Navigation Bar */}
      <header className="h-12 border-b border-divider bg-card px-4 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors focus:outline-none"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium">Assistant</span>
          </button>
          <span className="text-divider font-light">|</span>
          <h1 className="text-xs font-semibold text-text-primary">Profile Memory</h1>
        </div>

        <button
          type="button"
          onClick={() => void handleRefreshAll()}
          title="Refresh memory"
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Main Content Scrollable Area */}
      <main className="flex-1 p-3.5 sm:p-5 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {/* Top Overview & Stats */}
        <MemoryOverview
          approvedCount={approvedCount}
          pendingCount={pendingCount}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
        />

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150 ${
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
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{memoryError || proposalError}</span>
          </div>
        )}

        {/* Main Section Switcher Tabs */}
        <div className="flex gap-1.5 p-1 bg-page-bg border border-divider rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('APPROVED')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'APPROVED'
                ? 'bg-card text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Approved Memories</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'APPROVED'
                  ? 'bg-accent/15 text-accent'
                  : 'bg-divider text-text-secondary'
              }`}
            >
              {approvedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PENDING')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'PENDING'
                ? 'bg-card text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Proposals</span>
            {pendingCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-warning/20 text-warning">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'APPROVED' ? (
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
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}
      </main>

      {/* Edit Modal */}
      {editingMemory && (
        <EditMemoryModal
          memory={editingMemory}
          isOpen={true}
          onClose={() => setEditingMemory(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingMemory && (
        <DeleteMemoryDialog
          memory={deletingMemory}
          isOpen={true}
          onClose={() => setDeletingMemory(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {/* Manual Memory Creation Modal */}
      <CreateProposalModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateProposal}
      />
    </div>
  );
}

