import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Menu, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { keys, useCreateTask, useDeleteTask, useLists, useLogout, useSampleData, useTasks, useUpdateTask } from '../api/hooks';
import type { Task, TaskFilters, User } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ListSidebar } from '../components/ListSidebar';
import { NotificationPanel } from '../components/NotificationPanel';
import { SearchInput } from '../components/SearchInput';
import { TaskDialog } from '../components/TaskDialog';
import { TaskList } from '../components/TaskList';
import { TaskToolbar } from '../components/TaskToolbar';
import { UserMenu } from '../components/UserMenu';
import { useNotifications } from '../ws/useNotifications';

const NO_FILTERS: TaskFilters = { due: 'all' };

export function AppLayout({ user }: { user: User }) {
  const qc = useQueryClient();
  const [listId, setListId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<{ task: Task | null } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const query: TaskFilters = { ...filters, listId: listId ?? undefined };
  const lists = useLists();
  const tasks = useTasks(query);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const sample = useSampleData();
  const logout = useLogout();
  const notifications = useNotifications(true, () => qc.setQueryData(keys.me, null));

  const filtersActive = !!(filters.q || filters.status || filters.priority || filters.due !== 'all');
  const patchFilters = useCallback((p: Partial<TaskFilters>) => setFilters((f) => ({ ...f, ...p })), []);
  const setQuery = useCallback((q: string) => patchFilters({ q: q || undefined }), [patchFilters]);
  const selected = lists.data?.find((l) => l.id === listId);
  const selectList = (id: string | null) => {
    setListId(id);
    setDrawer(false);
  };

  const sidebar = <ListSidebar lists={lists.data ?? []} loading={lists.isLoading} selectedId={listId} onSelect={selectList} />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-neutral-50/90 px-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90 md:px-5">
        <button className="icon-btn md:hidden" aria-label="Open lists" onClick={() => setDrawer(true)}>
          <Menu className="size-5" />
        </button>
        <div className="hidden items-center gap-2 font-semibold md:flex">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent-600 text-white">
            <CheckSquare className="size-4" />
          </span>
          Todo Manager
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1">
          <SearchInput value={filters.q ?? ''} onChange={setQuery} />
        </div>
        <NotificationPanel
          status={notifications.status}
          items={notifications.items}
          prefs={notifications.prefs}
          onAck={notifications.ack}
          onPrefs={notifications.updatePrefs}
        />
        <UserMenu user={user} onLogout={() => logout.mutate()} />
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 md:block">
          {sidebar}
        </aside>

        <Dialog.Root open={drawer} onOpenChange={setDrawer}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
            <Dialog.Content className="animate-slide-in fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-neutral-50 shadow-xl dark:bg-neutral-950 md:hidden">
              <Dialog.Title className="sr-only">Lists</Dialog.Title>
              <Dialog.Description className="sr-only">Select a list</Dialog.Description>
              {sidebar}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <main className="min-w-0 flex-1 px-3 py-5 md:px-8">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="truncate text-xl font-semibold">{selected?.name ?? 'All tasks'}</h1>
              <button className="btn-primary shrink-0" disabled={!lists.data?.length} onClick={() => setDialog({ task: null })}>
                <Plus className="size-4" /> New task
              </button>
            </div>

            <TaskToolbar filters={filters} onChange={patchFilters} onClear={() => setFilters(NO_FILTERS)} active={filtersActive} />

            {lists.data && lists.data.length === 0 ? (
              <div className="card px-6 py-16 text-center">
                <h2 className="font-medium">Welcome, {user.displayName.split(' ')[0]}!</h2>
                <p className="mt-1 text-sm text-neutral-500">Create a list using the + button on the left, or start with sample data.</p>
                <button className="btn-primary mt-4" disabled={sample.isPending} onClick={() => sample.mutate()}>
                  Create sample data
                </button>
              </div>
            ) : (
              <TaskList
                tasks={tasks.data}
                lists={lists.data ?? []}
                loading={tasks.isLoading || lists.isLoading}
                filtersActive={filtersActive}
                showListName={!listId}
                onStatusChange={(t, status) => updateTask.mutate({ id: t.id, patch: { status } })}
                onEdit={(t) => setDialog({ task: t })}
                onDelete={setDeleting}
                onAdd={() => setDialog({ task: null })}
                onSample={() => sample.mutate()}
                onClearFilters={() => setFilters(NO_FILTERS)}
                samplePending={sample.isPending}
              />
            )}
          </div>
        </main>
      </div>

      <TaskDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        lists={lists.data ?? []}
        task={dialog?.task}
        defaultListId={listId ?? undefined}
        onSubmit={async (values) => {
          if (dialog?.task) await updateTask.mutateAsync({ id: dialog.task.id, patch: values });
          else await createTask.mutateAsync(values);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete task?"
        description={`“${deleting?.title}” will be permanently deleted.`}
        confirmLabel="Delete task"
        pending={deleteTask.isPending}
        onConfirm={() => deleting && deleteTask.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}
