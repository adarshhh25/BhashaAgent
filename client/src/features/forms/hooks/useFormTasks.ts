import { useState, useEffect, useCallback, useRef } from 'react';
import { formService } from '../services/form.service';
import type {
  CreateFormTaskRequest,
  FormTask,
  TaskPagination,
} from '../types/form.types';

export function useFormTasks(filterConversationId?: string) {
  const [tasks, setTasks] = useState<FormTask[]>([]);
  const [pagination, setPagination] = useState<TaskPagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await formService.listTasks({
        page,
        limit: 20,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        conversationId: filterConversationId,
        search: searchQuery.trim() ? searchQuery.trim() : undefined,
      });

      if (isMountedRef.current) {
        setTasks(res.tasks);
        setPagination(res.pagination);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load form tasks');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [page, statusFilter, filterConversationId, searchQuery]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await formService.listTasks({
          page,
          limit: 20,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          conversationId: filterConversationId,
          search: searchQuery.trim() ? searchQuery.trim() : undefined,
        });

        if (isMounted) {
          setTasks(res.tasks);
          setPagination(res.pagination);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load form tasks');
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
  }, [page, statusFilter, filterConversationId, searchQuery]);

  const createTask = useCallback(
    async (input: CreateFormTaskRequest): Promise<FormTask> => {
      const task = await formService.createTask(input);
      await fetchTasks();
      return task;
    },
    [fetchTasks],
  );

  return {
    tasks,
    pagination,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    fetchTasks,
    createTask,
  };
}

