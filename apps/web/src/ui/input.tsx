import type { ComponentPropsWithRef } from 'react';

import { cn } from '@/lib/cn';

// `ComponentPropsWithRef` rather than the attributes alone: React 19 passes
// `ref` as an ordinary prop, and a caller that needs to focus the box — the
// sidebar's ⌘K, for one — has nothing to hold on to without it.
export const Input = ({ className, ...props }: ComponentPropsWithRef<'input'>) => (
  <input
    className={cn(
      'border-line bg-app text-content placeholder:text-content-muted h-10 w-full rounded-lg border px-3 text-sm transition-colors',
      'focus:border-focus focus:outline-none',
      'disabled:opacity-60',
      className,
    )}
    {...props}
  />
);
