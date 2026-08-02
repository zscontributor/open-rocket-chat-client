import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges conditional class names, letting later Tailwind utilities win. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
