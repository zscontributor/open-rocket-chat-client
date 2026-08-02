import { useTranslation } from 'react-i18next';

import { modifierKey } from '@/lib/keys';
import { useUiStore } from '@/stores/ui-store';
import { PanelBody } from '../panel';

const Key = ({ children }: { children: string }) => (
  <kbd className="border-line bg-sunken text-content-secondary rounded border px-1.5 py-0.5 font-sans text-[11px] font-medium shadow-sm">
    {children}
  </kbd>
);

const Shortcut = ({ keys, label }: { keys: string[]; label: string }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-2">
    <span className="text-content-secondary min-w-0 flex-1 text-sm">{label}</span>
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key, index) => (
        <span key={key} className="flex items-center gap-1">
          {index > 0 ? <span className="text-content-muted text-[10px]">+</span> : null}
          <Key>{key}</Key>
        </span>
      ))}
    </span>
  </div>
);

/**
 * What the app responds to.
 *
 * Rocket.Chat puts its list in a modal; here it is a panel, because the bar is
 * already where reference material about the room lives and a modal would cover
 * the very thing the shortcuts act on.
 */
export const ShortcutsPanel = () => {
  const { t } = useTranslation('rooms');
  const mod = modifierKey();
  // The composer's own toggle decides which of these two sends, so the panel
  // reads it rather than stating a default that may not be in force.
  const enterToSend = useUiStore((state) => state.enterToSend);

  const groups = [
    {
      title: t('shortcuts.group.composer'),
      items: [
        { keys: enterToSend ? ['Enter'] : [mod, 'Enter'], label: t('shortcuts.send') },
        { keys: enterToSend ? ['Shift', 'Enter'] : ['Enter'], label: t('shortcuts.newline') },
        { keys: ['↑'], label: t('shortcuts.editLast') },
        { keys: ['Esc'], label: t('shortcuts.cancelEdit') },
      ],
    },
    {
      title: t('shortcuts.group.formatting'),
      items: [
        { keys: [mod, 'B'], label: t('shortcuts.bold') },
        { keys: [mod, 'I'], label: t('shortcuts.italic') },
        { keys: [mod, 'U'], label: t('shortcuts.underline') },
        { keys: [mod, 'Shift', 'X'], label: t('shortcuts.strike') },
        { keys: [mod, 'Shift', 'C'], label: t('shortcuts.code') },
      ],
    },
    {
      title: t('shortcuts.group.navigation'),
      items: [
        { keys: [mod, 'K'], label: t('shortcuts.searchRooms') },
        { keys: ['Esc'], label: t('shortcuts.closePanel') },
      ],
    },
  ];

  return (
    <PanelBody>
      {groups.map((group) => (
        <section key={group.title} className="border-line border-t py-2 first:border-t-0">
          <h3 className="text-content-secondary px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">
            {group.title}
          </h3>
          {group.items.map((item) => (
            <Shortcut key={item.label} keys={item.keys} label={item.label} />
          ))}
        </section>
      ))}
    </PanelBody>
  );
};
