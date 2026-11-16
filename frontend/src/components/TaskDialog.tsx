import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { List, Priority, Status, Task, TaskInput } from '../api/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../api/types';
import { isValidDate } from '../lib/dates';
import { SelectField } from './SelectField';

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
  description: z.string().max(5000, 'Description must be at most 5000 characters'),
  listId: z.string().min(1, 'Choose a list'),
  status: z.enum(['todo', 'in_progress', 'done']),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().refine((v) => v === '' || isValidDate(v), 'Enter a valid date'),
});
export type TaskFormValues = z.infer<typeof taskFormSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: List[];
  task?: Task | null;
  defaultListId?: string;
  onSubmit: (values: TaskInput) => void | Promise<void>;
}

const statusOptions = (Object.keys(STATUS_LABEL) as Status[]).map((value) => ({ value, label: STATUS_LABEL[value] }));
const priorityOptions = (Object.keys(PRIORITY_LABEL) as Priority[]).map((value) => ({ value, label: PRIORITY_LABEL[value] }));

function defaults(task: Task | null | undefined, listId: string): TaskFormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    listId: task?.listId ?? listId,
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    dueDate: task?.dueDate ?? '',
  };
}

export function TaskDialog({ open, onOpenChange, lists, task, defaultListId, onSubmit }: Props) {
  const fallbackList = defaultListId ?? lists[0]?.id ?? '';
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({ resolver: zodResolver(taskFormSchema), defaultValues: defaults(task, fallbackList) });

  useEffect(() => {
    if (open) reset(defaults(task, fallbackList));
  }, [open, task, fallbackList, reset]);

  const submit = handleSubmit(async (v) => {
    await onSubmit({ ...v, title: v.title.trim(), dueDate: v.dueDate || null });
    onOpenChange(false);
  });

  const err = (msg?: string, id?: string) =>
    msg ? (
      <p id={id} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
        {msg}
      </p>
    ) : null;
  const label = 'mb-1 block text-sm font-medium';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="card fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold">{task ? 'Edit task' : 'New task'}</Dialog.Title>
            <Dialog.Close className="icon-btn -mr-2 -mt-1" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Fill in the task details</Dialog.Description>

          <form onSubmit={submit} noValidate className="mt-4 space-y-4">
            <div>
              <label htmlFor="task-title" className={label}>Title</label>
              <input
                id="task-title"
                className="input"
                autoFocus
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? 'task-title-error' : undefined}
                {...register('title')}
              />
              {err(errors.title?.message, 'task-title-error')}
            </div>

            <div>
              <label htmlFor="task-description" className={label}>Description</label>
              <textarea
                id="task-description"
                rows={3}
                className="input h-auto py-2"
                aria-invalid={!!errors.description}
                {...register('description')}
              />
              {err(errors.description?.message)}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="task-list" className={label}>List</label>
                <Controller
                  control={control}
                  name="listId"
                  render={({ field }) => (
                    <SelectField
                      id="task-list"
                      aria-label="List"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={lists.map((l) => ({ value: l.id, label: l.name }))}
                    />
                  )}
                />
                {err(errors.listId?.message)}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="task-due" className={label}>Due date</label>
                <input id="task-due" type="date" className="input" aria-invalid={!!errors.dueDate} {...register('dueDate')} />
                {err(errors.dueDate?.message)}
              </div>
              <div>
                <label htmlFor="task-status" className={label}>Status</label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <SelectField id="task-status" aria-label="Status" value={field.value} onValueChange={field.onChange} options={statusOptions} />
                  )}
                />
              </div>
              <div>
                <label htmlFor="task-priority" className={label}>Priority</label>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <SelectField id="task-priority" aria-label="Priority" value={field.value} onValueChange={field.onChange} options={priorityOptions} />
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close className="btn-secondary" type="button">Cancel</Dialog.Close>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {task ? 'Save changes' : 'Create task'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
