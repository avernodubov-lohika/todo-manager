import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  onValueChange: (v: T) => void;
  options: Option<T>[];
  'aria-label': string;
  id?: string;
  className?: string;
}

export function SelectField<T extends string>({ value, onValueChange, options, className = '', ...rest }: Props<T>) {
  return (
    <Select.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <Select.Trigger
        id={rest.id}
        aria-label={rest['aria-label']}
        className={`input flex items-center justify-between gap-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 ${className}`}
      >
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="size-4 text-neutral-400" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={4} className="menu z-[100] min-w-[var(--radix-select-trigger-width)]">
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value} className="menu-item justify-between">
                <Select.ItemText>{o.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check className="size-4 text-accent-600" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
