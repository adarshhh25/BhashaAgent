import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Pause,
  Play,
} from 'lucide-react';
import { useFormTasks } from '../hooks/useFormTasks';
import { useActiveFormTask } from '../hooks/useActiveFormTask';
import { useActiveConversation } from '../../conversations/hooks/useActiveConversation';
import { FormTaskStatusBadge, FormLoadingState } from './FormEmptyState';
import { FormTaskList } from './FormTaskList';
import { FormFieldList } from './FormFieldList';
import { MissingFieldsPanel } from './MissingFieldsPanel';
import { ConflictResolutionPanel } from './ConflictResolutionPanel';
import { ApprovalSnapshotView } from './ApprovalSnapshotView';
import { FieldValueEditor } from './FieldValueEditor';
import { CreateFormTaskModal } from './CreateFormTaskModal';
import type { DetectedField } from '../types/form.types';

type DashboardSection = 'FIELDS' | 'MISSING' | 'CONFLICTS' | 'REVIEW';

export function FormTaskDashboard() {
  const navigate = useNavigate();
  const { activeConversationId } = useActiveConversation();

  // Tasks listing hook
  const {
    tasks,
    isLoading: isLoadingTasks,
    createTask,
    fetchTasks,
  } = useFormTasks(activeConversationId || undefined);

  // Selected task state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showTaskListDrawer, setShowTaskListDrawer] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>('FIELDS');

  // Derive effective active task id without cascading renders
  const effectiveTaskId = selectedTaskId || (tasks.length > 0 ? tasks[0]?.id || null : null);

  // Active task details hook
  const {
    task,
    fields,
    missingInformation,
    review,
    mappingResult,
    isLoading: isLoadingDetail,
    isMapping,
    isApprovingFinal,
    processingFieldIds,
    error: detailError,
    fetchDetail,
    runMapping,
    correctField,
    approveField,
    rejectField,
    finalApprove,
    pauseTask,
    resumeTask,
  } = useActiveFormTask(effectiveTaskId);

  // Modals state
  const [editingField, setEditingField] = useState<DetectedField | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleRunMapping = async () => {
    try {
      await runMapping();
      showFeedback('success', 'Intelligent field mapping complete');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Mapping failed');
    }
  };

  const handleSaveFieldCorrection = async (fieldId: string, value: unknown) => {
    try {
      await correctField(fieldId, value);
      showFeedback('success', 'Field value updated (User Corrected)');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update field');
      throw err;
    }
  };

  const handleApproveField = async (fieldId: string) => {
    try {
      await approveField(fieldId);
      showFeedback('success', 'Field value approved');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to approve field');
    }
  };

  const handleRejectField = async (fieldId: string) => {
    try {
      await rejectField(fieldId);
      showFeedback('success', 'Field value rejected');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to reject field');
    }
  };

  const handleFinalApprove = async () => {
    try {
      await finalApprove();
      showFeedback('success', 'Form approved for filling! Ready for browser execution.');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleTogglePause = async () => {
    if (!task) return;
    try {
      if (task.status === 'PAUSED') {
        await resumeTask();
        showFeedback('success', 'Task resumed');
      } else {
        await pauseTask();
        showFeedback('success', 'Task paused');
      }
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchTasks(), fetchDetail()]);
    showFeedback('success', 'Form data refreshed');
  }, [fetchTasks, fetchDetail]);

  const missingCount = missingInformation?.missingRequiredFields?.length ?? 0;
  const conflictCount = mappingResult?.results?.filter((r) => r.status === 'conflict')?.length ?? 0;

  return (
    <div className="flex flex-col min-h-screen bg-page-bg">
      {/* Top Header */}
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
          <h1 className="text-xs font-semibold text-text-primary">Form Intelligence</h1>
        </div>

        <div className="flex items-center gap-1">
          {/* Switcher toggle */}
          <button
            type="button"
            onClick={() => setShowTaskListDrawer((prev) => !prev)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-divider text-xs text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tasks ({tasks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            title="Refresh form tasks"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-3.5 sm:p-5 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs animate-in fade-in duration-150 ${
              feedback.type === 'success'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-danger/10 border-danger/30 text-danger'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedback.text}</span>
          </div>
        )}

        {detailError && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{detailError}</span>
          </div>
        )}

        {/* Task Selection Drawer Modal */}
        {showTaskListDrawer && (
          <div className="p-4 bg-card border border-divider rounded-2xl shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-divider">
              <h3 className="text-xs font-semibold text-text-primary">
                Available Form Tasks ({tasks.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowTaskListDrawer(false)}
                className="text-xs text-text-secondary hover:text-text-primary"
              >
                Done
              </button>
            </div>
            <FormTaskList
              tasks={tasks}
              activeTaskId={effectiveTaskId}
              isLoading={isLoadingTasks}
              onSelectTask={(id) => {
                setSelectedTaskId(id);
                setShowTaskListDrawer(false);
              }}
              onOpenCreate={() => setIsCreateModalOpen(true)}
            />
          </div>
        )}

        {/* Active Task Card Banner */}
        {task ? (
          <div className="bg-card border border-divider rounded-xl p-3.5 shadow-2xs flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs font-semibold text-text-primary truncate">
                    {task.title || task.webpageTitle || 'Webpage Form Task'}
                  </h2>
                  <FormTaskStatusBadge status={task.status} />
                </div>
                <p className="text-[11px] text-text-secondary font-mono mt-0.5 truncate">
                  {task.webpageUrl}
                </p>
              </div>

              {/* Action Buttons: Mapping & Pause */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleTogglePause()}
                  title={task.status === 'PAUSED' ? 'Resume task' : 'Pause task'}
                  className="p-1.5 rounded-lg border border-divider text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors"
                >
                  {task.status === 'PAUSED' ? (
                    <Play className="w-3.5 h-3.5" />
                  ) : (
                    <Pause className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={isMapping || task.status === 'APPROVED_FOR_FILLING'}
                  onClick={() => void handleRunMapping()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-all shadow-xs disabled:opacity-50 shrink-0"
                >
                  {isMapping ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Run Mapping</span>
                </button>
              </div>
            </div>

            {/* Sub-tabs: Fields, Missing, Conflicts, Review */}
            <div className="flex gap-1 p-1 bg-page-bg border border-divider rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveSection('FIELDS')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  activeSection === 'FIELDS'
                    ? 'bg-card text-text-primary shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Fields ({fields.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('MISSING')}
                className={`flex-1 py-1 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeSection === 'MISSING'
                    ? 'bg-card text-text-primary shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>Missing</span>
                {missingCount > 0 && (
                  <span className="text-[9px] font-bold px-1.5 rounded-full bg-danger/15 text-danger">
                    {missingCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('CONFLICTS')}
                className={`flex-1 py-1 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeSection === 'CONFLICTS'
                    ? 'bg-card text-text-primary shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>Conflicts</span>
                {conflictCount > 0 && (
                  <span className="text-[9px] font-bold px-1.5 rounded-full bg-warning/20 text-warning">
                    {conflictCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('REVIEW')}
                className={`flex-1 py-1 rounded-lg transition-all flex items-center justify-center gap-1 ${
                  activeSection === 'REVIEW'
                    ? 'bg-card text-text-primary shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>Review</span>
              </button>
            </div>
          </div>
        ) : (
          <FormTaskList
            tasks={tasks}
            activeTaskId={effectiveTaskId}
            isLoading={isLoadingTasks}
            onSelectTask={(id) => setSelectedTaskId(id)}
            onOpenCreate={() => setIsCreateModalOpen(true)}
          />
        )}

        {/* Active Section Content */}
        {isLoadingDetail && !task ? (
          <FormLoadingState />
        ) : task ? (
          <div className="flex flex-col gap-3">
            {activeSection === 'FIELDS' && (
              <FormFieldList
                fields={fields}
                processingFieldIds={processingFieldIds}
                onEditField={(f) => setEditingField(f)}
                onApproveField={handleApproveField}
                onRejectField={handleRejectField}
              />
            )}

            {activeSection === 'MISSING' && (
              <MissingFieldsPanel
                missingInfo={missingInformation}
                onProvideValue={(f) => setEditingField(f)}
              />
            )}

            {activeSection === 'CONFLICTS' && (
              <ConflictResolutionPanel
                mappingResult={mappingResult}
                fields={fields}
                onCorrectField={(f) => setEditingField(f)}
              />
            )}

            {activeSection === 'REVIEW' && (
              <ApprovalSnapshotView
                task={task}
                review={review}
                detectedFields={fields}
                isApprovingFinal={isApprovingFinal}
                onFinalApprove={handleFinalApprove}
              />
            )}
          </div>
        ) : null}
      </main>

      {/* Field Value Editor Modal */}
      {editingField && (
        <FieldValueEditor
          field={editingField}
          isOpen={true}
          onClose={() => setEditingField(null)}
          onSave={handleSaveFieldCorrection}
        />
      )}

      {/* Create Task Modal */}
      <CreateFormTaskModal
        conversationId={activeConversationId || '00000000-0000-0000-0000-000000000000'}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={async (input) => {
          const newTask = await createTask(input);
          setSelectedTaskId(newTask.id);
          showFeedback('success', 'Form task created');
        }}
      />
    </div>
  );
}
