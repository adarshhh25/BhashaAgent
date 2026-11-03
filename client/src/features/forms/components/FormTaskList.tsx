import { useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import type { FormTask } from '../types/form.types';
import { FormTaskCard } from './FormTaskCard';
import { FormEmptyState, FormLoadingState } from './FormEmptyState';

interface FormTaskListProps {
  tasks: FormTask[];
  activeTaskId: string | null;
  isLoading: boolean;
  onSelectTask: (taskId: string) => void;
  onOpenCreate: () => void;
}

type TaskStatusTab = 'ALL' | 'ACTIVE' | 'REVIEW' | 'APPROVED';

export function FormTaskList({
  tasks,
  activeTaskId,
  isLoading,
  onSelectTask,
  onOpenCreate,
}: FormTaskListProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TaskStatusTab>('ALL');

  const filteredTasks = tasks.filter((t) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchPageTitle = t.webpageTitle?.toLowerCase().includes(q);
      const matchUrl = t.webpageUrl.toLowerCase().includes(q);
      if (!matchTitle && !matchPageTitle && !matchUrl) return false;
    }

    if (activeTab === 'APPROVED') return t.status === 'APPROVED_FOR_FILLING' || t.status === 'COMPLETED';
    if (activeTab === 'REVIEW') return t.status === 'REVIEW' || t.status === 'AWAITING_FINAL_APPROVAL';
    if (activeTab === 'ACTIVE') return t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'FAILED';
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Top Search & Create */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-7 text-xs bg-input-bg border border-divider rounded-lg text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-accent"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-placeholder hover:text-text-secondary p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenCreate}
          title="New Form Task"
          className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-all shadow-xs shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Task</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-page-bg border border-divider rounded-xl text-xs font-semibold">
        {(['ALL', 'ACTIVE', 'REVIEW', 'APPROVED'] as TaskStatusTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1 rounded-lg transition-all capitalize ${
              activeTab === tab
                ? 'bg-card text-text-primary shadow-2xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.toLowerCase()}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <FormLoadingState />
      ) : filteredTasks.length === 0 ? (
        <FormEmptyState
          title="No form tasks found"
          description={
            search
              ? 'Try adjusting your search query.'
              : 'When BhashaAgent inspects webpage forms, detected tasks will appear here.'
          }
          action={
            <button
              type="button"
              onClick={onOpenCreate}
              className="px-3 py-1.5 rounded-lg bg-page-bg border border-divider text-text-primary text-xs font-medium hover:bg-card transition-colors"
            >
              Register Webpage Form
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredTasks.map((t) => (
            <FormTaskCard
              key={t.id}
              task={t}
              isActive={t.id === activeTaskId}
              onSelect={onSelectTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

