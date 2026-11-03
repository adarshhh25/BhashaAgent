import { useState, useEffect, useCallback, useRef } from 'react';
import { memoryService } from '../services/memory.service';
import type {
  CreateProposalRequest,
  MemoryPagination,
  MemoryProposal,
  ProfileMemory,
} from '../types/memory.types';

export function useMemoryProposals() {
  const [proposals, setProposals] = useState<MemoryProposal[]>([]);
  const [pagination, setPagination] = useState<MemoryPagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [page, setPage] = useState(1);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchProposals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await memoryService.listProposals({
        page,
        limit: 20,
        status: statusFilter,
      });

      if (isMountedRef.current) {
        setProposals(res.proposals);
        setPagination(res.pagination);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load memory proposals');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [page, statusFilter]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await memoryService.listProposals({
          page,
          limit: 20,
          status: statusFilter,
        });

        if (isMounted) {
          setProposals(res.proposals);
          setPagination(res.pagination);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load memory proposals');
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
  }, [page, statusFilter]);

  const approveProposal = useCallback(
    async (
      proposalId: string,
    ): Promise<{ proposal: MemoryProposal; memory?: ProfileMemory }> => {
      setProcessingIds((prev) => new Set(prev).add(proposalId));
      try {
        const result = await memoryService.approveProposal(proposalId);
        // Refresh proposal list
        await fetchProposals();
        return result;
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
      }
    },
    [fetchProposals],
  );

  const rejectProposal = useCallback(
    async (proposalId: string, reason?: string): Promise<MemoryProposal> => {
      setProcessingIds((prev) => new Set(prev).add(proposalId));
      try {
        const result = await memoryService.rejectProposal(proposalId, { reason });
        // Refresh proposal list
        await fetchProposals();
        return result;
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
      }
    },
    [fetchProposals],
  );

  const createProposal = useCallback(
    async (input: CreateProposalRequest): Promise<MemoryProposal> => {
      const result = await memoryService.createProposal(input);
      await fetchProposals();
      return result;
    },
    [fetchProposals],
  );

  return {
    proposals,
    pagination,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    processingIds,
    fetchProposals,
    approveProposal,
    rejectProposal,
    createProposal,
  };
}
