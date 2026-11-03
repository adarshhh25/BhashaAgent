import { useState, useEffect, useCallback, useRef } from 'react';
import { memoryService } from '../services/memory.service';
import type {
  MemoryCategory,
  MemoryPagination,
  MemoryProposal,
  ProfileMemory,
  UpdateMemoryRequest,
} from '../types/memory.types';

export function useMemories() {
  const [memories, setMemories] = useState<ProfileMemory[]>([]);
  const [pagination, setPagination] = useState<MemoryPagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchMemories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await memoryService.listApprovedMemories({
        page,
        limit: 20,
        category: categoryFilter === 'ALL' ? undefined : categoryFilter,
        key: searchQuery.trim() ? searchQuery.trim() : undefined,
      });

      if (isMountedRef.current) {
        setMemories(res.memories);
        setPagination(res.pagination);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load approved memories');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [page, categoryFilter, searchQuery]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await memoryService.listApprovedMemories({
          page,
          limit: 20,
          category: categoryFilter === 'ALL' ? undefined : categoryFilter,
          key: searchQuery.trim() ? searchQuery.trim() : undefined,
        });

        if (isMounted) {
          setMemories(res.memories);
          setPagination(res.pagination);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load approved memories');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [page, categoryFilter, searchQuery]);

  const editMemory = useCallback(
    async (id: string, input: UpdateMemoryRequest): Promise<MemoryProposal> => {
      const proposal = await memoryService.editMemory(id, input);
      return proposal;
    },
    [],
  );

  const deleteMemory = useCallback(async (id: string): Promise<MemoryProposal> => {
    const proposal = await memoryService.deleteMemory(id);
    return proposal;
  }, []);

  return {
    memories,
    pagination,
    isLoading,
    error,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    fetchMemories,
    editMemory,
    deleteMemory,
  };
}
