import type { RoomSummary } from '@open-rocket-chat/client-sdk';

import {
  canPruneMessages,
  canUseThreads,
  canViewMembers,
  canViewMentions,
  canViewPinnedMessages,
  useCapabilities,
  type Capabilities,
} from '@/features/server/use-capabilities';
import type { IconName } from '@/ui/icon';
import type { ContextualTab, ContextualTabId } from './store';

export interface ToolboxAction {
  tab: ContextualTab;
  /** Key in the `rooms` namespace, under `bar.title`. */
  id: ContextualTabId;
  icon: IconName;
  /**
   * Rocket.Chat's own ordering, kept verbatim so the toolbar reads the same on
   * both clients. The numbers are sparse in Rocket.Chat too — they leave room
   * for the tabs this client does not implement.
   */
  order: number;
}

/**
 * Which panels this room offers, in Rocket.Chat's order.
 *
 * Every entry mirrors one of Rocket.Chat's `use*RoomAction` hooks, including
 * which rooms it appears in: Mentions and Members are meaningless in a direct
 * message, Threads and Pinned disappear when an administrator switches the
 * feature off, and Prune is permission-gated.
 */
const buildActions = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): ToolboxAction[] => {
  const actions: ToolboxAction[] = [{ tab: { id: 'room-info' }, id: 'room-info', icon: 'info', order: 1 }];

  if (canUseThreads(capabilities)) {
    actions.push({ tab: { id: 'threads' }, id: 'threads', icon: 'threads', order: 2 });
  }

  actions.push({ tab: { id: 'search' }, id: 'search', icon: 'search', order: 5 });

  if (canViewMentions(room)) {
    actions.push({ tab: { id: 'mentions' }, id: 'mentions', icon: 'mention', order: 6 });
  }

  if (canViewMembers(capabilities, room)) {
    actions.push({ tab: { id: 'members' }, id: 'members', icon: 'members', order: 7 });
  }

  actions.push({ tab: { id: 'files' }, id: 'files', icon: 'attach', order: 8 });

  if (canViewPinnedMessages(capabilities)) {
    actions.push({ tab: { id: 'pinned' }, id: 'pinned', icon: 'pin', order: 9 });
  }

  actions.push({ tab: { id: 'starred' }, id: 'starred', icon: 'star', order: 10 });
  actions.push({ tab: { id: 'notifications' }, id: 'notifications', icon: 'notifications', order: 11 });

  if (canPruneMessages(capabilities, room)) {
    actions.push({ tab: { id: 'prune' }, id: 'prune', icon: 'eraser', order: 250 });
  }

  // Not a Rocket.Chat tab — its shortcut list is a modal — but the bar is where
  // this client already puts reference material, and it needs no room at all.
  actions.push({ tab: { id: 'shortcuts' }, id: 'shortcuts', icon: 'keyboard', order: 260 });

  return actions.sort((left, right) => left.order - right.order);
};

export const useRoomToolboxActions = (room: RoomSummary | undefined): ToolboxAction[] => {
  const { data: capabilities } = useCapabilities();
  return buildActions(capabilities, room);
};

/**
 * How many actions the header shows before the rest move into the menu.
 *
 * Six, matching Rocket.Chat's own `normalActions.slice(0, 6)`. The number
 * matters more than it looks: with the ordering above, six is exactly what it
 * takes to reach Members and Files, which are the two panels people actually
 * open — burying them under "More" to save a little width is a bad trade.
 */
export const VISIBLE_TOOLBOX_ACTIONS = 6;

/**
 * And how many it shows on a phone: none.
 *
 * Six 36px targets are more than a phone's header has to give, and what gives
 * way to make space for them is the room's name — the one thing in that row
 * that says which conversation is on screen. They all move into the "More"
 * menu, which costs a tap and, unlike the icons, names every panel it holds.
 */
export const VISIBLE_TOOLBOX_ACTIONS_NARROW = 0;
