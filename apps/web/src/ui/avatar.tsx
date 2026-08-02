import * as RadixAvatar from '@radix-ui/react-avatar';

import { useClient } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';

/** Deterministic tint per user, so the same person keeps the same colour. */
const TINTS = [
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  'bg-violet-500/15 text-violet-800 dark:text-violet-300',
  'bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300',
];

const tintFor = (seed: string): string => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return TINTS[hash % TINTS.length] as string;
};

const initialsOf = (name: string): string =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

const SIZES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-14 text-base',
} as const;

/**
 * Exported so a status picker can mark its options with the same dot the
 * avatar wears — one colour per presence, defined once.
 */
export const STATUS_COLOURS = {
  online: 'bg-online',
  away: 'bg-away',
  busy: 'bg-busy',
  offline: 'bg-offline',
} as const;

export interface AvatarProps {
  name: string;
  /** Gateway-relative avatar path from the API, if the user has one. */
  src?: string | null;
  size?: keyof typeof SIZES;
  status?: keyof typeof STATUS_COLOURS | null;
  className?: string;
}

export const Avatar = ({ name, src, size = 'md', status, className }: AvatarProps) => {
  // Avatars are proxied by the gateway, and the proxy needs to know which
  // server's user this is.
  const client = useClient();

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <RadixAvatar.Root className={cn('flex overflow-hidden rounded-lg', SIZES[size])}>
        {src ? <RadixAvatar.Image src={client.mediaUrl(src)} alt="" className="size-full object-cover" /> : null}
        {/* Rendered while the image loads and whenever it fails, so a broken
          avatar URL degrades to initials rather than an empty box. */}
        <RadixAvatar.Fallback
          delayMs={src ? 300 : 0}
          className={cn('flex size-full items-center justify-center font-semibold', tintFor(name))}
        >
          {initialsOf(name)}
        </RadixAvatar.Fallback>
      </RadixAvatar.Root>

      {status ? (
        <span
          // Ringed in the surface colour so the dot stays legible against the
          // avatar underneath it, whatever the theme.
          className={cn(
            'ring-app absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2',
            STATUS_COLOURS[status],
          )}
        />
      ) : null}
    </span>
  );
};
