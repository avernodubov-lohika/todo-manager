import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, browserTimezone } from './client';
import type { List, Task, TaskFilters, TaskInput, User } from './types';

export const keys = {
  me: ['me'] as const,
  lists: ['lists'] as const,
  tasks: (f: TaskFilters) => ['tasks', f] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<User>('/api/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export const useLists = () => useQuery({ queryKey: keys.lists, queryFn: () => api<List[]>('/api/lists') });

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: keys.tasks(filters),
    queryFn: () => {
      const p = new URLSearchParams({ due: filters.due, tz: browserTimezone() });
      if (filters.listId) p.set('listId', filters.listId);
      if (filters.q) p.set('q', filters.q);
      if (filters.status) p.set('status', filters.status);
      if (filters.priority) p.set('priority', filters.priority);
      return api<Task[]>(`/api/tasks?${p}`);
    },
    placeholderData: (prev) => prev,
  });
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['tasks'] }), qc.invalidateQueries({ queryKey: keys.lists })]);
}

export function useCreateList() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api<List>('/api/lists', { method: 'POST', body: { name } }),
    onSuccess: inv,
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function useRenameList() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api<List>(`/api/lists/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: inv,
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function useDeleteList() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<{ id: string; deletedTasks: number }>(`/api/lists/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      toast.success(`List deleted (${r.deletedTasks} task${r.deletedTasks === 1 ? '' : 's'} removed)`);
      return inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function useCreateTask() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: TaskInput) => api<Task>('/api/tasks', { method: 'POST', body: input }),
    onSuccess: () => {
      toast.success('Task created');
      return inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

/** PATCH with optimistic update of every cached task list (used for quick status changes). */
export function useUpdateTask() {
  const qc = useQueryClient();
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskInput> }) =>
      api<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: ['tasks'] });
      qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => old?.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      return { snapshots };
    },
    onError: (e, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(errMsg(e));
    },
    onSettled: inv,
  });
}

export function useDeleteTask() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Task deleted');
      return inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function useSampleData() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api<{ lists: number; tasks: number }>(`/api/sample-data?tz=${encodeURIComponent(browserTimezone())}`, { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(`Created ${r.lists} lists with ${r.tasks} tasks`);
      return inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(keys.me, null);
    },
  });
}
