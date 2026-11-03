import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { DetectedField } from '../types/form.types';
import { FormFieldCard } from './FormFieldCard';
import { FormEmptyState } from './FormEmptyState';

interface FormFieldListProps {
  fields: DetectedField[];
  processingFieldIds: Set<string>;
  onEditField: (field: DetectedField) => void;
  onApproveField: (fieldId: string) => Promise<void>;
  onRejectField: (fieldId: string) => Promise<void>;
}

type FilterTab = 'ALL' | 'REVIEW' | 'MISSING' | 'APPROVED';

export function FormFieldList({
  fields,
  processingFieldIds,
  onEditField,
  onApproveField,
  onRejectField,
}: FormFieldListProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const filteredFields = useMemo(() => {
    return fields.filter((f) => {
      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesLabel = f.label?.toLowerCase().includes(q);
        const matchesId = f.fieldIdentifier.toLowerCase().includes(q);
        if (!matchesLabel && !matchesId) return false;
      }

      const valRecord = f.fieldValues?.[0];
      const hasValue = Boolean(valRecord?.value);
      const isApproved = valRecord?.status === 'APPROVED';
      const isPending = valRecord?.status === 'PENDING_APPROVAL' || valRecord?.status === 'PROPOSED';

      if (activeTab === 'APPROVED') return isApproved;
      if (activeTab === 'MISSING') return !hasValue;
      if (activeTab === 'REVIEW') return isPending;
      return true;
    });
  }, [fields, search, activeTab]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search & Tabs */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            placeholder="Search fields by label or identifier..."
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

        <div className="flex gap-1 p-1 bg-page-bg border border-divider rounded-xl text-xs font-semibold">
          {(['ALL', 'REVIEW', 'MISSING', 'APPROVED'] as FilterTab[]).map((tab) => (
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
              {tab === 'ALL'
                ? `All (${fields.length})`
                : tab === 'REVIEW'
                ? 'Review'
                : tab === 'MISSING'
                ? 'Missing'
                : 'Approved'}
            </button>
          ))}
        </div>
      </div>

      {/* Field Cards Stream */}
      {filteredFields.length === 0 ? (
        <FormEmptyState
          title="No fields match filter"
          description={
            search
              ? 'Try adjusting your search query.'
              : activeTab === 'MISSING'
              ? 'Great! All detected fields have mapped values.'
              : activeTab === 'REVIEW'
              ? 'No fields currently awaiting review.'
              : 'No fields detected for this form task.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredFields.map((field) => (
            <FormFieldCard
              key={field.id}
              field={field}
              isProcessing={processingFieldIds.has(field.id)}
              onEdit={onEditField}
              onApprove={onApproveField}
              onReject={onRejectField}
            />
          ))}
        </div>
      )}
    </div>
  );
}

