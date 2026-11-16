import { Check, List as ListIcon, ListTodo, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useCreateList, useDeleteList, useRenameList } from '../api/hooks';
import type { List } from '../api/types';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  lists: List[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function NameForm({ initial = '', onSubmit, onCancel, label }: { initial?: string; onSubmit: (name: string) => void; onCancel: () => void; label: string }) {
  const [name, setName] = useState(initial);
  const submit = () => {
    const v = name.trim();
    if (v && v.length <= 100) onSubmit(v);
  };
  return (
    <form
      className="flex items-center gap-1 px-1"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        className="input h-8"
        aria-label={label}
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <button type="submit" className="icon-btn" aria-label="Save"><Check className="size-4" /></button>
      <button type="button" className="icon-btn" aria-label="Cancel" onClick={onCancel}><X className="size-4" /></button>
    </form>
  );
}

export function ListSidebar({ lists, loading, selectedId, onSelect }: Props) {
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<List | null>(null);
  const create = useCreateList();
  const rename = useRenameList();
  const del = useDeleteList();
  const total = lists.reduce((n, l) => n + l.taskCount, 0);

  const row = (active: boolean) =>
    `group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
      active
        ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-700/20 dark:text-accent-100'
        : 'text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800'
    }`;

  return (
    <nav aria-label="Lists" className="flex h-full flex-col gap-1 p-3">
      <button className={`${row(selectedId === null)} focus-ring w-full text-left`} onClick={() => onSelect(null)}>
        <ListTodo className="size-4 shrink-0" />
        <span className="flex-1 truncate">All tasks</span>
        <span className="text-xs text-neutral-500">{total}</span>
      </button>

      <div className="mt-3 flex items-center justify-between px-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lists</h2>
        <button className="icon-btn size-6" aria-label="New list" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
        </button>
      </div>

      {creating && (
        <NameForm
          label="New list name"
          onCancel={() => setCreating(false)}
          onSubmit={(name) => create.mutate(name, { onSuccess: (l) => { setCreating(false); onSelect(l.id); } })}
        />
      )}

      {loading && <div className="mx-2.5 mt-1 h-6 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />}
      {!loading && lists.length === 0 && !creating && (
        <p className="px-2.5 py-2 text-sm text-neutral-500">No lists yet. Create one with the + button.</p>
      )}

      <ul className="space-y-0.5 overflow-y-auto">
        {lists.map((l) =>
          renamingId === l.id ? (
            <li key={l.id}>
              <NameForm
                label="List name"
                initial={l.name}
                onCancel={() => setRenamingId(null)}
                onSubmit={(name) => rename.mutate({ id: l.id, name }, { onSuccess: () => setRenamingId(null) })}
              />
            </li>
          ) : (
            <li key={l.id} className={row(selectedId === l.id)}>
              <button className="focus-ring -m-1 flex min-w-0 flex-1 items-center gap-2 rounded p-1 text-left" onClick={() => onSelect(l.id)} aria-current={selectedId === l.id ? 'page' : undefined}>
                <ListIcon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-xs text-neutral-500">{l.taskCount}</span>
              </button>
              <span className="flex md:hidden md:group-hover:flex md:group-focus-within:flex">
                <button className="icon-btn size-6" aria-label={`Rename ${l.name}`} onClick={() => setRenamingId(l.id)}>
                  <Pencil className="size-3.5" />
                </button>
                <button className="icon-btn size-6 hover:!text-red-600" aria-label={`Delete ${l.name}`} onClick={() => setDeleting(l)}>
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </li>
          ),
        )}
      </ul>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={
          deleting?.taskCount
            ? `This will permanently delete the list and its ${deleting.taskCount} task${deleting.taskCount === 1 ? '' : 's'}. This cannot be undone.`
            : 'This list is empty. This cannot be undone.'
        }
        confirmLabel="Delete list"
        pending={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              if (selectedId === deleting.id) onSelect(null);
              setDeleting(null);
            },
          })
        }
      />
    </nav>
  );
}
