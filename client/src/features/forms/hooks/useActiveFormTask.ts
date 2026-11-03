import { useState, useEffect, useCallback, useRef } from 'react';
import { formService } from '../services/form.service';
import type {
  ApprovalRecord,
  DetectedField,
  FormIntelligenceResult,
  FormTask,
  MissingInformationResult,
  TaskReviewResult,
} from '../types/form.types';

export function useActiveFormTask(taskId: string | null) {
  const [task, setTask] = useState<FormTask | null>(null);
  const [fields, setFields] = useState<DetectedField[]>([]);
  const [missingInformation, setMissingInformation] = useState<MissingInformationResult | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [review, setReview] = useState<TaskReviewResult | null>(null);
  const [mappingResult, setMappingResult] = useState<FormIntelligenceResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [isApprovingFinal, setIsApprovingFinal] = useState(false);
  const [processingFieldIds, setProcessingFieldIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setFields([]);
      setMissingInformation(null);
      setApprovals([]);
      setReview(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [detail, reviewData] = await Promise.all([
        formService.getTask(taskId),
        formService.getReview(taskId).catch(() => null),
      ]);

      if (isMountedRef.current) {
        setTask(detail.task);
        setFields(detail.fields);
        setMissingInformation(detail.missingInformation);
        setApprovals(detail.approvals);
        setReview(reviewData);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load form task details');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [taskId]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!taskId) {
        setTask(null);
        setFields([]);
        setMissingInformation(null);
        setApprovals([]);
        setReview(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const [detail, reviewData] = await Promise.all([
          formService.getTask(taskId),
          formService.getReview(taskId).catch(() => null),
        ]);

        if (isMounted) {
          setTask(detail.task);
          setFields(detail.fields);
          setMissingInformation(detail.missingInformation);
          setApprovals(detail.approvals);
          setReview(reviewData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load form task details');
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
  }, [taskId]);

  const runMapping = useCallback(async () => {
    if (!taskId || !task) return;
    setIsMapping(true);
    setError(null);
    try {
      const res = await formService.runIntelligentMapping(taskId, task.version);
      if (isMountedRef.current) {
        setMappingResult(res);
      }
      await fetchDetail();
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to execute intelligent mapping');
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsMapping(false);
      }
    }
  }, [taskId, task, fetchDetail]);

  const correctField = useCallback(
    async (fieldId: string, value: unknown) => {
      if (!taskId) return;
      setProcessingFieldIds((prev) => new Set(prev).add(fieldId));
      try {
        await formService.correctFieldValue(taskId, fieldId, { value });
        await fetchDetail();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update field value');
        throw err;
      } finally {
        setProcessingFieldIds((prev) => {
          const next = new Set(prev);
          next.delete(fieldId);
          return next;
        });
      }
    },
    [taskId, fetchDetail],
  );

  const approveField = useCallback(
    async (fieldId: string) => {
      if (!taskId) return;
      setProcessingFieldIds((prev) => new Set(prev).add(fieldId));
      try {
        await formService.approveFieldValue(taskId, fieldId);
        await fetchDetail();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve field value');
        throw err;
      } finally {
        setProcessingFieldIds((prev) => {
          const next = new Set(prev);
          next.delete(fieldId);
          return next;
        });
      }
    },
    [taskId, fetchDetail],
  );

  const rejectField = useCallback(
    async (fieldId: string) => {
      if (!taskId) return;
      setProcessingFieldIds((prev) => new Set(prev).add(fieldId));
      try {
        await formService.rejectFieldValue(taskId, fieldId);
        await fetchDetail();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject field value');
        throw err;
      } finally {
        setProcessingFieldIds((prev) => {
          const next = new Set(prev);
          next.delete(fieldId);
          return next;
        });
      }
    },
    [taskId, fetchDetail],
  );

  const finalApprove = useCallback(async () => {
    if (!taskId || !task) return;
    setIsApprovingFinal(true);
    setError(null);
    try {
      await formService.finalApprove(taskId, task.version);
      await fetchDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Final approval failed');
      throw err;
    } finally {
      setIsApprovingFinal(false);
    }
  }, [taskId, task, fetchDetail]);

  const pauseTask = useCallback(async () => {
    if (!taskId || !task) return;
    await formService.pauseTask(taskId, task.version);
    await fetchDetail();
  }, [taskId, task, fetchDetail]);

  const resumeTask = useCallback(async () => {
    if (!taskId || !task) return;
    await formService.resumeTask(taskId, task.version);
    await fetchDetail();
  }, [taskId, task, fetchDetail]);

  const cancelTask = useCallback(async () => {
    if (!taskId || !task) return;
    await formService.cancelTask(taskId, task.version);
    await fetchDetail();
  }, [taskId, task, fetchDetail]);

  const deleteTask = useCallback(async () => {
    if (!taskId) return;
    await formService.deleteTask(taskId);
  }, [taskId]);

  return {
    task,
    fields,
    missingInformation,
    approvals,
    review,
    mappingResult,
    isLoading,
    isMapping,
    isApprovingFinal,
    processingFieldIds,
    error,
    fetchDetail,
    runMapping,
    correctField,
    approveField,
    rejectField,
    finalApprove,
    pauseTask,
    resumeTask,
    cancelTask,
    deleteTask,
  };
}

