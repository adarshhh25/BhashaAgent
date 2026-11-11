import { useMemo } from 'react';
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
  // Client-side search across key, value, and category for immediate responsiveness
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const q = searchQuery.toLowerCase().trim();
    return memories.filter((m) => {
      const keyMatch =
        m.key.toLowerCase().includes(q) ||
        m.key.replace(/_/g, ' ').toLowerCase().includes(q);
      const valStr =
        typeof m.value === 'string'
          ? m.value
          : JSON.stringify(m.value);
      const valMatch = valStr.toLowerCase().includes(q);
      const catMatch = m.category.toLowerCase().includes(q);
      return keyMatch || valMatch || catMatch;
    });
  }, [memories, searchQuery]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Search Input Bar (Stitch pill style) */}
      <div className="relative">
        <div className="flex items-center bg-card border border-divider rounded-full px-3.5 py-2 shadow-2xs focus-within:border-[#102A24] transition-colors">
          <Search className="w-4 h-4 text-text-placeholder shrink-0 mr-2.5" />
          <input
            type="text"
            placeholder="Search approved memories by keyword..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full text-xs text-[#102A24] placeholder:text-text-placeholder bg-transparent outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="p-1 text-text-placeholder hover:text-text-primary transition-colors shrink-0"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Chips (horizontal scrollable) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          type="button"
          onClick={() => onCategoryFilterChange('ALL')}
          className={`px-4 py-1.5 rounded-full shrink-0 font-medium transition-colors ${
            categoryFilter === 'ALL'
              ? 'bg-[#102A24] text-white shadow-2xs'
              : 'bg-card border border-divider text-text-secondary hover:border-[#102A24]/40'
          }`}
        >
          All
        </button>
        {MEMORY_CATEGORIES.map((cat) => {
          const isSelected = categoryFilter === cat;
          const displayLabel = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryFilterChange(cat)}
              className={`px-4 py-1.5 rounded-full shrink-0 font-medium transition-colors ${
                isSelected
                  ? 'bg-[#102A24] text-white shadow-2xs'
                  : 'bg-card border border-divider text-text-secondary hover:border-[#102A24]/40'
              }`}
            >
              {displayLabel}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <MemoryLoadingState />
      ) : filteredMemories.length === 0 ? (
        <MemoryEmptyState
          title="No approved memories found"
          description={
            searchQuery || categoryFilter !== 'ALL'
              ? 'Try adjusting your search query or category filter.'
              : 'Save personal context, preferences, and custom instructions to personalize every conversation.'
          }
          action={
            <button
              type="button"
              onClick={onOpenCreate}
              className="px-4 py-2 rounded-full bg-[#102A24] hover:bg-[#17483A] text-white text-xs font-semibold shadow-xs transition-colors"
            >
              + Add Memory
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredMemories.map((memory) => (
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
                  className="p-1.5 rounded-lg bg-card border border-divider hover:bg-page-bg disabled:opacity-40 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => onPageChange(page + 1)}
                  className="p-1.5 rounded-lg bg-card border border-divider hover:bg-page-bg disabled:opacity-40 transition-colors"
                  aria-label="Next page"
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
