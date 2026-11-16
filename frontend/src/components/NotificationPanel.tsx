import * as Popover from '@radix-ui/react-popover';
import * as Switch from '@radix-ui/react-switch';
import { Bell, CheckCheck } from 'lucide-react';
import type { ConnectionStatus, NotificationItem, NotificationPrefs, NotificationType } from '../ws/useNotifications';
import { SelectField } from './SelectField';

interface Props {
  status: ConnectionStatus;
  items: NotificationItem[];
  prefs: NotificationPrefs;
  onAck: (ids: string[]) => void;
  onPrefs: (p: NotificationPrefs) => void;
}

const intervals = [
  { value: '10', label: 'Every 10 seconds' },
  { value: '30', label: 'Every 30 seconds' },
  { value: '60', label: 'Every minute' },
  { value: '300', label: 'Every 5 minutes' },
  { value: '900', label: 'Every 15 minutes' },
  { value: '3600', label: 'Every hour' },
];

const dot: Record<ConnectionStatus, string> = {
  open: 'bg-emerald-500',
  connecting: 'bg-amber-400 animate-pulse',
  closed: 'bg-red-500',
};
const dotLabel: Record<ConnectionStatus, string> = {
  open: 'Connected',
  connecting: 'Connecting…',
  closed: 'Disconnected — retrying',
};

export function NotificationPanel({ status, items, prefs, onAck, onPrefs }: Props) {
  const toggle = (type: NotificationType, on: boolean) =>
    onPrefs({ ...prefs, types: on ? [...new Set([...prefs.types, type])] : prefs.types.filter((t) => t !== type) });

  return (
    <Popover.Root>
      <Popover.Trigger className="icon-btn relative size-9" aria-label={`Notifications (${items.length} unread)`}>
        <Bell className="size-5" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {items.length > 99 ? '99+' : items.length}
          </span>
        )}
        <span
          className={`absolute bottom-1 right-1 size-2 rounded-full ring-2 ring-neutral-50 dark:ring-neutral-950 ${dot[status]}`}
          role="status"
          aria-label={dotLabel[status]}
          title={dotLabel[status]}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="card z-50 w-[min(24rem,calc(100vw-1rem))] p-0 shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="text-xs text-neutral-500">{dotLabel[status]}</p>
            </div>
            <button className="btn-ghost h-8 px-2 text-xs" disabled={!items.length} onClick={() => onAck(items.map((i) => i.id))}>
              <CheckCheck className="size-4" /> Mark all read
            </button>
          </div>

          <ul className="max-h-72 divide-y divide-neutral-200 overflow-y-auto dark:divide-neutral-800">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-neutral-500">You’re all caught up 🎉</li>}
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i.type === 'overdue' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.title}</p>
                  <p className="text-xs text-neutral-500">
                    {i.type === 'overdue' ? 'Overdue' : 'Due soon'} · {i.dueDate}
                  </p>
                </div>
                <button className="btn-ghost h-7 px-2 text-xs" onClick={() => onAck([i.id])}>Mark read</button>
              </li>
            ))}
          </ul>

          <div className="space-y-3 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Settings</h3>
            {(['overdue', 'due_soon'] as const).map((t) => (
              <label key={t} className="flex items-center justify-between text-sm">
                {t === 'overdue' ? 'Overdue tasks' : 'Due within 3 days'}
                <Switch.Root
                  checked={prefs.types.includes(t)}
                  onCheckedChange={(on) => toggle(t, on)}
                  className="focus-ring relative h-5 w-9 rounded-full bg-neutral-300 transition-colors data-[state=checked]:bg-accent-600 dark:bg-neutral-700"
                >
                  <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </label>
            ))}
            <SelectField
              aria-label="Check interval"
              value={String(prefs.intervalSec)}
              onValueChange={(v) => onPrefs({ ...prefs, intervalSec: Number(v) })}
              options={intervals}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
