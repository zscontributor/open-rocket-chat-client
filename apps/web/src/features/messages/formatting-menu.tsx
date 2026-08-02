import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { modifierKey } from '@/lib/keys';
import { Icons, type IconName } from '@/ui/icon';
import { MARK_ORDER, type MarkName } from './formatting';

/**
 * The chord each mark answers to, as the keydown handler in the composer reads
 * it — `shift` is what keeps strikethrough and code off `⌘S` and `⌘C`, which
 * the browser has already spoken for.
 *
 * A code block has none. Every letter left over is one a browser answers to at
 * a level a page cannot override — `⌘⇧K` opens Firefox's console whatever this
 * file says — and a shortcut that works in one browser and opens developer
 * tools in another is worse than the button on its own.
 */
export const MARK_SHORTCUTS: Partial<Record<MarkName, { key: string; shift?: boolean }>> = {
  bold: { key: 'b' },
  italic: { key: 'i' },
  underline: { key: 'u' },
  strike: { key: 'x', shift: true },
  code: { key: 'c', shift: true },
};

const MARK_ICONS: Record<MarkName, IconName> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
  code: 'code',
  codeBlock: 'codeBlock',
};

/** `⌘ + Shift + X`, spelled for whichever platform is reading it. */
const shortcutLabel = (mark: MarkName): string | null => {
  const chord = MARK_SHORTCUTS[mark];
  if (!chord) return null;

  return [modifierKey(), ...(chord.shift ? ['Shift'] : []), chord.key.toUpperCase()].join(' + ');
};

/**
 * The composer's formatting toolbar.
 *
 * A popover rather than a permanent row: the composer's bottom edge is already
 * carrying attachments, emoji, GIFs, voice and preview, and six more buttons
 * there would push the send button off a narrow window. Most actions here are
 * also on a keyboard chord, so the menu is the discoverable path rather than
 * the only one.
 */
export const FormattingMenu = ({
  onApply,
  disabled,
  trigger,
}: {
  onApply: (mark: MarkName) => void;
  disabled?: boolean;
  trigger: ReactNode;
}) => {
  const { t } = useTranslation('composer');
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        {trigger}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="bg-panel border-line z-40 flex items-center gap-0.5 rounded-xl border p-1 shadow-lg"
          aria-label={t('formatting.title')}
          // Radix hands focus back to the trigger when the popover closes, and
          // it does so after the caller has already put the caret between the
          // marks it just wrote — so the box someone is meant to type into
          // loses focus a frame later. The composer moves focus itself; this
          // gets Radix out of the way rather than racing it.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {MARK_ORDER.map((mark) => {
            const Icon = Icons[MARK_ICONS[mark]];
            const label = t(`formatting.${mark}`);
            const shortcut = shortcutLabel(mark);

            return (
              <button
                key={mark}
                type="button"
                aria-label={label}
                title={shortcut ? `${label} (${shortcut})` : label}
                onClick={() => {
                  onApply(mark);
                  setOpen(false);
                }}
                className="text-content-muted hover:bg-sunken hover:text-content flex size-8 items-center justify-center rounded-md transition-colors"
              >
                <Icon size={18} />
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
