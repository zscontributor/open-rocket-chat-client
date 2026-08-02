import type { SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';
import { Icons } from '@/ui/icon';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A native `<select>`, styled.
 *
 * Deliberately not a listbox built from divs: the native control already gets
 * keyboard handling, type-ahead, screen-reader semantics and — on a phone — the
 * platform's own picker, none of which a custom one gets for free.
 */
export const Select = ({
  options,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }) => (
  <span className="relative inline-flex w-full">
    <select
      className={cn(
        'border-line bg-app text-content h-9 w-full appearance-none rounded-lg border pr-8 pl-3 text-sm transition-colors',
        'focus:border-focus focus:outline-none',
        'disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <Icons.chevronDown
      size={14}
      aria-hidden
      className="text-content-muted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
    />
  </span>
);
