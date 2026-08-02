import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';

/**
 * The scrolling region of a panel.
 *
 * Every panel is a header the bar owns plus a body it does not, so the body is
 * the only part that scrolls — a panel that scrolled as a whole would take its
 * search box and its filter out of reach exactly when a long list makes them
 * useful.
 */
export const PanelBody = ({
  children,
  className,
  ref,
}: {
  children: ReactNode;
  className?: string;
  /** For the panels that drive their own scrolling, as the thread pane does. */
  ref?: Ref<HTMLDivElement>;
}) => (
  <div ref={ref} className={cn('scrollbar-slim min-h-0 flex-1 overflow-y-auto', className)}>
    {children}
  </div>
);

/** A fixed strip above the body: search boxes, filters, counts. */
export const PanelToolbar = ({ children }: { children: ReactNode }) => (
  <div className="border-line shrink-0 space-y-2 border-b px-4 py-3">{children}</div>
);

export const PanelSection = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="border-line border-t py-3 first:border-t-0">
    <div className="flex items-center justify-between px-4 pb-1.5">
      <h3 className="text-content-secondary text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

/** A labelled value in a details list, hidden entirely when there is no value. */
export const PanelField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="px-4 py-2">
    <dt className="text-content-muted text-xs font-medium">{label}</dt>
    <dd className="mt-0.5 text-sm break-words whitespace-pre-line">{children}</dd>
  </div>
);

export const PanelSearch = ({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) => (
  <div className="relative">
    <Icons.search
      size={16}
      className="text-content-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
    />
    <Input
      type="search"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 pl-9"
    />
  </div>
);

/**
 * The three states a list can be in before it has rows: still loading, failed,
 * or genuinely empty. Kept together because getting one of them wrong shows a
 * spinner forever or an "empty" list that actually failed to load.
 */
export const PanelState = ({
  loading,
  error,
  empty,
  emptyLabel,
  emptyIcon,
  children,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyLabel: string;
  emptyIcon?: ReactNode;
  children: ReactNode;
}) => {
  const { t } = useTranslation('common');

  if (loading) {
    return (
      <p className="text-content-muted flex items-center justify-center gap-2 py-10 text-sm">
        <Spinner className="size-4" /> {t('state.loading')}
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-danger px-4 py-10 text-center text-sm">
        {describeError(error)}
      </p>
    );
  }

  if (empty) {
    return (
      <div className="text-content-muted flex flex-col items-center gap-2 px-4 py-10 text-center text-sm">
        {emptyIcon ? <span className="opacity-40">{emptyIcon}</span> : null}
        {emptyLabel}
      </div>
    );
  }

  return <>{children}</>;
};

/**
 * Explicit paging rather than an infinite scroll sentinel.
 *
 * These lists sit beside a conversation that is itself scrolling; a second
 * region that loads more as it is scrolled makes the two compete for the wheel,
 * and a button is also the only version that works from the keyboard.
 */
export const LoadMore = ({ onClick, loading }: { onClick: () => void; loading: boolean }) => {
  const { t } = useTranslation('common');

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="border-line hover:bg-sunken text-content-secondary flex w-full items-center justify-center gap-2 rounded-lg border py-2 text-xs font-medium transition-colors disabled:opacity-60"
      >
        {loading ? <Spinner className="size-3.5" /> : null}
        {t('action.loadMore')}
      </button>
    </div>
  );
};

/** A row of large icon buttons under a panel's heading, as Room Info uses. */
export const QuickAction = ({
  label,
  icon,
  danger,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    title={label}
    aria-pressed={active}
    className={cn(
      // `min-w-0` is what lets the label actually truncate: a flex item defaults
      // to `min-width: auto`, so a long one ("Remove from favorites") refuses to
      // shrink and pushes the rest of the row out past the panel's edge.
      'flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] transition-colors disabled:opacity-40',
      danger
        ? 'text-danger enabled:hover:bg-danger/10'
        : active
          ? 'bg-sunken text-content'
          : 'text-content-secondary enabled:hover:bg-sunken enabled:hover:text-content',
    )}
  >
    <span className="shrink-0">{icon}</span>
    {/* Two lines, but only at word boundaries — no `break-words`, which splits
        "Favorited" into "Favorit / ed". Translations that need the second line
        ("Thành viên") have a space to break at; the ones that do not are short
        enough to fit, which is what keeps this row to four actions. */}
    <span className="line-clamp-2 w-full text-center leading-tight">{label}</span>
  </button>
);
