import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type MemoryPagination,
  type ProfileMemory,
} from '../types/memory.types';
import { ApprovedMemoryCard } from './ApprovedMemoryCard';
import { MemoryEmptyState, MemoryLoadingState } from './MemoryEmptyState';

interface ApprovedMemoryListProps {
  memories: ProfileMemory[];
  pagination: MemoryPagination | null;
  isLoading: boolean;
  categoryFilter: MemoryCategory | 'ALL';
  onCategoryFilterChange: (cat: MemoryCategory | 'ALL') => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  page: number;
  onPageChange: (newPage: number) => void;
  onEdit: (memory: ProfileMemory) => void;
  onDelete: (memory: ProfileMemory) => void;
  onOpenCreate: () => void;
}

export function ApprovedMemoryList({
  memories,
  pagination,
  isLoading,
  categoryFilter,
  onCategoryFilterChange,
  searchQuery,
  onSearchQueryChange,
  page,
  onPageChange,
  onEdit,
  onDelete,
  onOpenCreate,
}: ApprovedMemoryListProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Search & Category Filter Bar */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            placeholder="Search approved memories by key..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full h-8 pl-8 pr-7 text-xs bg-input-bg border border-divider rounded-lg text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-placeholder hover:text-text-secondary p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Category Pills (horizontal scroll) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
          <button
            type="button"
            onClick={() => onCategoryFilterChange('ALL')}
            className={`px-2.5 py-1 rounded-md shrink-0 font-medium transition-colors ${
              categoryFilter === 'ALL'
                ? 'bg-text-primary text-white'
                : 'bg-card border border-divider text-text-secondary hover:text-text-primary'
            }`}
          >
            All
          </button>
          {MEMORY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryFilterChange(cat)}
              className={`px-2.5 py-1 rounded-md shrink-0 font-medium transition-colors capitalize ${
                categoryFilter === cat
                  ? 'bg-text-primary text-white'
                  : 'bg-card border border-divider text-text-secondary hover:text-text-primary'
              }`}
            >
              {cat.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <MemoryLoadingState />
      ) : memories.length === 0 ? (
        <MemoryEmptyState
          title="No approved memories found"
          description={
            searchQuery || categoryFilter !== 'ALL'
              ? 'Try adjusting your search query or category filter.'
              : 'BhashaAgent has not remembered any facts yet. You can add one or chat with the assistant.'
          }
          action={
            <button
              type="button"
              onClick={onOpenCreate}
              className="px-3 py-1.5 rounded-lg bg-page-bg border border-divider text-text-primary text-xs font-medium hover:bg-card transition-colors"
            >
              Add first memory
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {memories.map((memory) => (
            <ApprovedMemoryCard
              key={memory.id}
              memory={memory}
              onEdit={onEdit}
              onDelete={onDelete}
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

