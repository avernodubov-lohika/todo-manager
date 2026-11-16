import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { CalendarDays, Check, CircleDashed, CircleDot, CircleCheck, Pencil, Trash2 } from 'lucide-react';
import type { Priority, Status, Task } from '../api/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../api/types';
import { formatDue } from '../lib/dates';

const statusIcon: Record<Status, React.ReactNode> = {
  todo: <CircleDashed className="size-5 text-neutral-400" />,
  in_progress: <CircleDot className="size-5 text-accent-600" />,
  done: <CircleCheck className="size-5 text-emerald-600" />,
};

const priorityStyle: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  low: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
};

const dueStyle = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  today: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  soon: 'bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-100',
  normal: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
};

interface Props {
  task: Task;
  listName?: string;
  onStatusChange: (status: Status) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function TaskRow({ task, listName, onStatusChange, onEdit, onDelete }: Props) {
  const done = task.status === 'done';
  const due = task.dueDate ? formatDue(task.dueDate) : null;
  const tone = due && (done ? 'normal' : due.tone);

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
      <Dropdown.Root>
        <Dropdown.Trigger
          className="icon-btn mt-0.5 size-7 shrink-0"
          aria-label={`Status: ${STATUS_LABEL[task.status]}. Change status`}
        >
          {statusIcon[task.status]}
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="start" sideOffset={4} className="menu">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <Dropdown.Item key={s} className="menu-item" onSelect={() => onStatusChange(s)}>
                {statusIcon[s]}
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                {s === task.status && <Check className="size-4 text-accent-600" />}
              </Dropdown.Item>
            ))}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${done ? 'text-neutral-400 line-through' : ''}`}>{task.title}</p>
        {task.description && <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${priorityStyle[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
          {due && tone && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${dueStyle[tone]}`}>
              <CalendarDays className="size-3" />
              {done ? due.label.split(' · ')[0] : due.label}
            </span>
          )}
          <span className="rounded-full px-2 py-0.5 text-neutral-500 dark:text-neutral-400">{STATUS_LABEL[task.status]}</span>
          {listName && <span className="text-neutral-400">· {listName}</span>}
        </div>
      </div>

      <div className="flex shrink-0 gap-0.5 md:opacity-0 md:transition-opacity md:focus-within:opacity-100 md:group-hover:opacity-100">
        <button className="icon-btn" aria-label={`Edit ${task.title}`} onClick={onEdit}>
          <Pencil className="size-4" />
        </button>
        <button className="icon-btn hover:!text-red-600" aria-label={`Delete ${task.title}`} onClick={onDelete}>
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
