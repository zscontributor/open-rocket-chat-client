import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-content hover:bg-accent-hover',
        subtle: 'bg-sunken text-content hover:bg-line',
        outline: 'border-line text-content hover:bg-sunken border',
        ghost: 'text-content-muted hover:bg-sunken hover:text-content',
        danger: 'text-danger hover:bg-danger/10',
      },
      size: {
        sm: 'h-8 rounded-md px-2.5 text-sm',
        md: 'h-10 rounded-lg px-4 text-sm',
        icon: 'size-8 rounded-md p-0',
        iconLg: 'size-10 rounded-lg p-0',
      },
    },
    defaultVariants: { variant: 'subtle', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export const Button = ({ className, variant, size, type = 'button', ...props }: ButtonProps) => (
  <button type={type} className={cn(button({ variant, size }), className)} {...props} />
);
