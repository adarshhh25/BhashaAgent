import { type ReactNode } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import type { FormTaskStatus } from '../types/form.types';

interface FormEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function FormEmptyState({
  icon,
  title,
  description,
  action,
}: FormEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-xl border border-divider shadow-2xs">
      <div className="w-12 h-12 rounded-2xl bg-page-bg text-text-placeholder flex items-center justify-center mb-3">
        {icon ?? <FileSpreadsheet className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <h3 className="text-xs font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-[11px] text-text-secondary max-w-xs mb-4 leading-relaxed">
        {description}
      </p>
      {action}
    </div>
  );
}

export function FormLoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="p-4 bg-card rounded-xl border border-divider animate-pulse flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 bg-page-bg rounded-md" />
            <div className="h-4 w-20 bg-page-bg rounded-md" />
          </div>
          <div className="h-5 w-56 bg-page-bg rounded-md" />
          <div className="h-3 w-40 bg-page-bg rounded-md mt-1" />
        </div>
      ))}
    </div>
  );
}

interface FormTaskStatusBadgeProps {
  status: FormTaskStatus;
}

export function FormTaskStatusBadge({ status }: FormTaskStatusBadgeProps) {
  const getStyle = () => {
    switch (status) {
      case 'APPROVED_FOR_FILLING':
        return 'bg-success/15 text-success border-success/30';
      case 'COMPLETED':
        return 'bg-success/10 text-success border-success/20';
      case 'REVIEW':
      case 'AWAITING_FINAL_APPROVAL':
        return 'bg-accent/15 text-accent border-accent/30';
      case 'AWAITING_INFORMATION':
        return 'bg-warning/15 text-warning border-warning/30';
      case 'FIELDS_DETECTED':
      case 'MAPPING_IN_PROGRESS':
        return 'bg-accent/10 text-accent border-accent/20';
      case 'FAILED':
      case 'CANCELLED':
        return 'bg-danger/15 text-danger border-danger/30';
      case 'PAUSED':
        return 'bg-page-bg text-text-secondary border-divider';
      default:
        return 'bg-page-bg text-text-secondary border-divider';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'APPROVED_FOR_FILLING':
        return 'Approved for Filling';
      case 'AWAITING_FINAL_APPROVAL':
        return 'Awaiting Approval';
      case 'AWAITING_INFORMATION':
        return 'Needs Information';
      case 'FIELDS_DETECTED':
        return 'Fields Detected';
      case 'MAPPING_IN_PROGRESS':
        return 'Mapping...';
      case 'REVIEW':
        return 'In Review';
      case 'COMPLETED':
        return 'Completed';
      case 'FAILED':
        return 'Failed';
      case 'CANCELLED':
        return 'Cancelled';
      case 'PAUSED':
        return 'Paused';
      default:
        return status.replace(/_/g, ' ');
    }
  };

  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStyle()}`}
    >
      {getLabel()}
    </span>
  );
}

