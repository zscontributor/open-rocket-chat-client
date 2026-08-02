import type { Message, RoomSummary, Session, UserSummary } from '@open-rocket-chat/client-sdk';
import type { ComponentType, ReactNode } from 'react';

/**
 * What a plugin can add to the client.
 *
 * Contribution points are deliberately narrow. A plugin that could render
 * anywhere would break on every layout change, and a host that promised that
 * could never change its layout. Each point below is a place the host commits
 * to keeping.
 */

/** Everything a contribution is handed when it runs. Read-only. */
export interface PluginContext {
  /** The signed-in user and the server they are on. */
  session: Session;
  /** Opens a room by id, as clicking it in the sidebar would. */
  openRoom: (roomId: string) => void;
  /** Shows a message in the client's own notification surface. */
  notify: (notice: { level: 'info' | 'success' | 'warning' | 'error'; message: string }) => void;
  /** The active locale, so a contribution can translate its own strings. */
  locale: string;
}

/** An entry in the sidebar's shortcut list, beside Threads and Mentions. */
export interface SidebarItemContribution {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Badge count; omit or return 0 for none. */
  badge?: () => number;
  onSelect: (context: PluginContext) => void;
  /** Lower sorts first. Built-in items occupy 0–100. */
  order?: number;
}

/** An action on the message hover toolbar and its overflow menu. */
export interface MessageActionContribution {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /**
   * Whether this action applies. Called for every rendered message, so keep it
   * cheap — no network, no allocation-heavy work.
   */
  isVisible?: (message: Message, room: RoomSummary | undefined) => boolean;
  onSelect: (message: Message, context: PluginContext) => void;
  order?: number;
  /** Rendered in the danger colour, like Delete. */
  destructive?: boolean;
}

/** A button in the composer toolbar, beside emoji and attachments. */
export interface ComposerActionContribution {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  onSelect: (
    context: PluginContext & {
      roomId: string;
      /** Inserts text at the caret, as the emoji picker does. */
      insert: (text: string) => void;
    },
  ) => void;
  order?: number;
}

/** A panel in Settings, below Appearance and Language. */
export interface SettingsPanelContribution {
  id: string;
  title: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  render: ComponentType<{ context: PluginContext }>;
  order?: number;
}

/** Wraps the whole application — for providers a plugin needs in scope. */
export interface ProviderContribution {
  id: string;
  render: ComponentType<{ children: ReactNode }>;
}

/**
 * Reacts to things happening, without rendering anything.
 *
 * Handlers must not throw: the host calls them inside its own event handling,
 * and a plugin failure should not take the client down with it.
 */
export interface EventHooks {
  onMessageReceived?: (message: Message, context: PluginContext) => void;
  onMessageSent?: (message: Message, context: PluginContext) => void;
  onRoomOpened?: (room: RoomSummary, context: PluginContext) => void;
  onSignIn?: (user: UserSummary, context: PluginContext) => void;
}

export interface PluginContributions {
  sidebarItems?: SidebarItemContribution[];
  messageActions?: MessageActionContribution[];
  composerActions?: ComposerActionContribution[];
  settingsPanels?: SettingsPanelContribution[];
  providers?: ProviderContribution[];
  events?: EventHooks;
}

export interface Plugin {
  /** Stable, URL-safe identifier. Also what a deployment disables it by. */
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  /**
   * Called once when the plugin is registered, before any contribution runs.
   * Returning contributions here — rather than declaring them statically —
   * lets a plugin decide what to offer based on the server it connected to.
   */
  setup: (host: PluginHost) => PluginContributions | Promise<PluginContributions>;
}

/** What the host exposes to a plugin during `setup`. */
export interface PluginHost {
  /** The gateway SDK instance, already authenticated by the session cookie. */
  client: unknown;
  /** Server settings and permissions, so a plugin can respect them too. */
  capabilities: unknown;
  locale: string;
}
