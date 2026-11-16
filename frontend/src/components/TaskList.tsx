import { Inbox, SearchX, Sparkles } from 'lucide-react';
import type { List, Status, Task } from '../api/types';
import { TaskRow } from './TaskRow';

interface Props {
  tasks: Task[] | undefined;
  lists: List[];
  loading: boolean;
  filtersActive: boolean;
  showListName: boolean;
  onStatusChange: (task: Task, status: Status) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAdd: () => void;
  onSample: () => void;
  onClearFilters: () => void;
  samplePending?: boolean;
}

export function TaskList(p: Props) {
  if (p.loading) {
    return (
      <ul className="card divide-y divide-neutral-200 dark:divide-neutral-800" aria-busy="true" aria-label="Loading tasks">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex animate-pulse items-start gap-3 px-4 py-3">
            <div className="mt-0.5 size-6 rounded-full bg-neutral-200 dark:bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-1/4 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (!p.tasks?.length) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        {p.filtersActive ? (
          <>
            <SearchX className="size-10 text-neutral-300 dark:text-neutral-600" />
            <h2 className="mt-3 font-medium">No tasks match your search</h2>
            <p className="mt-1 text-sm text-neutral-500">Try different keywords or clear the filters.</p>
            <button className="btn-secondary mt-4" onClick={p.onClearFilters}>Clear filters</button>
          </>
        ) : (
          <>
            <Inbox className="size-10 text-neutral-300 dark:text-neutral-600" />
            <h2 className="mt-3 font-medium">No tasks yet</h2>
            <p className="mt-1 text-sm text-neutral-500">Add your first task, or fill the app with sample data to explore.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={p.onAdd}>Add a task</button>
              <button className="btn-secondary" onClick={p.onSample} disabled={p.samplePending}>
                <Sparkles className="size-4" /> Create sample data
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const names = new Map(p.lists.map((l) => [l.id, l.name]));
  return (
    <ul className="card divide-y divide-neutral-200 dark:divide-neutral-800">
      {p.tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          listName={p.showListName ? names.get(t.listId) : undefined}
          onStatusChange={(s) => p.onStatusChange(t, s)}
          onEdit={() => p.onEdit(t)}
          onDelete={() => p.onDelete(t)}
        />
      ))}
    </ul>
  );
}
