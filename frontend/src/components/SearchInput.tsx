import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  delayMs?: number;
}

/** Controlled-from-outside search box that debounces what it reports upward. */
export function SearchInput({ value, onChange, delayMs = 300 }: Props) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), delayMs);
    return () => clearTimeout(t);
  }, [text, value, onChange, delayMs]);

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        className="input pl-9"
        placeholder="Search tasks…"
        aria-label="Search tasks"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
