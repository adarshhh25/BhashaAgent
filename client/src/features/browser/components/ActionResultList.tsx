import { ActionResultItem } from './ActionResultItem';
import type { ActionResultItem as ActionResultItemType } from '../types/browser.types';
import type { DetectedField } from '../../forms/types/form.types';

interface ActionResultListProps {
  results: ActionResultItemType[];
  fields?: DetectedField[];
}

export function ActionResultList({ results, fields = [] }: ActionResultListProps) {
  if (results.length === 0) return null;

  const fieldMap = new Map(fields.map((f) => [f.id, f.label || f.fieldIdentifier]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="font-semibold uppercase tracking-wider text-[11px]">
          Field Execution Details
        </span>
        <span>{results.length} action{results.length === 1 ? '' : 's'} recorded</span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
        {results.map((result) => (
          <ActionResultItem
            key={`${result.fieldId}-${result.actionId}`}
            result={result}
            label={fieldMap.get(result.fieldId)}
          />
        ))}
      </div>
    </div>
  );
}

