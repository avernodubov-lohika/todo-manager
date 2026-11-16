import { FilterX } from 'lucide-react';
import type { DueFilter, Priority, Status, TaskFilters } from '../api/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../api/types';
import { SelectField } from './SelectField';

interface Props {
  filters: TaskFilters;
  onChange: (patch: Partial<TaskFilters>) => void;
  onClear: () => void;
  active: boolean;
}

const statusOptions = [{ value: 'all', label: 'Any status' }, ...(Object.keys(STATUS_LABEL) as Status[]).map((v) => ({ value: v, label: STATUS_LABEL[v] }))];
const priorityOptions = [{ value: 'all', label: 'Any priority' }, ...(Object.keys(PRIORITY_LABEL) as Priority[]).map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))];
const dueOptions: { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Next 7 days' },
];

export function TaskToolbar({ filters, onChange, onClear, active }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectField
        aria-label="Filter by status"
        className="w-40"
        value={filters.status ?? 'all'}
        onValueChange={(v) => onChange({ status: v === 'all' ? undefined : (v as Status) })}
        options={statusOptions}
      />
      <SelectField
        aria-label="Filter by priority"
        className="w-40"
        value={filters.priority ?? 'all'}
        onValueChange={(v) => onChange({ priority: v === 'all' ? undefined : (v as Priority) })}
        options={priorityOptions}
      />
      <SelectField
        aria-label="Filter by due date"
        className="w-40"
        value={filters.due}
        onValueChange={(v) => onChange({ due: v })}
        options={dueOptions}
      />
      {active && (
        <button className="btn-ghost" onClick={onClear}>
          <FilterX className="size-4" /> Clear filters
        </button>
      )}
    </div>
  );
}
