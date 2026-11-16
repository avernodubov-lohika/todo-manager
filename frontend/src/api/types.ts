export type Status = 'todo' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type DueFilter = 'all' | 'overdue' | 'today' | 'week';

export interface User {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  provider: string;
}
export interface List {
  id: string;
  name: string;
  createdAt: string;
  taskCount: number;
}
export interface Task {
  id: string;
  listId: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TaskInput {
  listId: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
}
export interface TaskFilters {
  listId?: string;
  q?: string;
  status?: Status;
  priority?: Priority;
  due: DueFilter;
}

export const STATUS_LABEL: Record<Status, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };
