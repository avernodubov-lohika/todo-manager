import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { LogOut } from 'lucide-react';
import type { User } from '../api/types';

export function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const initials = user.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="focus-ring rounded-full" aria-label="Account menu">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-accent-600 text-xs font-semibold text-white">{initials}</span>
        )}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="menu w-56">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            {user.email && <p className="truncate text-xs text-neutral-500">{user.email}</p>}
          </div>
          <Dropdown.Separator className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />
          <Dropdown.Item className="menu-item" onSelect={onLogout}>
            <LogOut className="size-4" /> Log out
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
