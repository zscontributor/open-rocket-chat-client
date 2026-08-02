import type {
  ComposerActionContribution,
  EventHooks,
  MessageActionContribution,
  Plugin,
  PluginContributions,
  PluginHost,
  ProviderContribution,
  SettingsPanelContribution,
  SidebarItemContribution,
} from './contributions.js';

export class PluginError extends Error {
  override readonly name = 'PluginError';

  constructor(
    readonly pluginId: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(`Plugin "${pluginId}": ${message}`);
  }
}

interface RegisteredPlugin {
  plugin: Plugin;
  contributions: PluginContributions;
}

const byOrder = <T extends { order?: number }>(left: T, right: T): number =>
  (left.order ?? 1000) - (right.order ?? 1000);

/**
 * The set of plugins the running client has loaded.
 *
 * A plugin that throws during setup is skipped with its error surfaced, rather
 * than taking the client down: an optional extension must never be able to
 * stop someone reading their messages.
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, RegisteredPlugin>();

  private readonly failures = new Map<string, PluginError>();

  async register(plugin: Plugin, host: PluginHost): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new PluginError(plugin.id, 'a plugin with this id is already registered');
    }

    try {
      const contributions = await plugin.setup(host);
      this.plugins.set(plugin.id, { plugin, contributions });
      this.failures.delete(plugin.id);
    } catch (error) {
      const failure = new PluginError(plugin.id, 'setup failed', error);
      this.failures.set(plugin.id, failure);
      throw failure;
    }
  }

  /** Registers several, isolating failures so one bad plugin cannot block the rest. */
  async registerAll(plugins: Plugin[], host: PluginHost): Promise<PluginError[]> {
    const errors: PluginError[] = [];

    for (const plugin of plugins) {
      try {
        await this.register(plugin, host);
      } catch (error) {
        errors.push(error instanceof PluginError ? error : new PluginError(plugin.id, 'setup failed', error));
      }
    }

    return errors;
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
    this.failures.delete(pluginId);
  }

  list(): Plugin[] {
    return [...this.plugins.values()].map((entry) => entry.plugin);
  }

  /** Plugins that failed to set up, for a diagnostics panel. */
  errors(): PluginError[] {
    return [...this.failures.values()];
  }

  sidebarItems(): SidebarItemContribution[] {
    return this.collect((contributions) => contributions.sidebarItems).sort(byOrder);
  }

  messageActions(): MessageActionContribution[] {
    return this.collect((contributions) => contributions.messageActions).sort(byOrder);
  }

  composerActions(): ComposerActionContribution[] {
    return this.collect((contributions) => contributions.composerActions).sort(byOrder);
  }

  settingsPanels(): SettingsPanelContribution[] {
    return this.collect((contributions) => contributions.settingsPanels).sort(byOrder);
  }

  providers(): ProviderContribution[] {
    return this.collect((contributions) => contributions.providers);
  }

  /**
   * Invokes an event hook across every plugin.
   *
   * Each call is isolated: a plugin that throws is reported and skipped, and
   * the remaining plugins still see the event.
   */
  emit<K extends keyof EventHooks>(
    event: K,
    invoke: (handler: NonNullable<EventHooks[K]>) => void,
    onError?: (error: PluginError) => void,
  ): void {
    for (const { plugin, contributions } of this.plugins.values()) {
      const handler = contributions.events?.[event];
      if (!handler) continue;

      try {
        invoke(handler as NonNullable<EventHooks[K]>);
      } catch (error) {
        onError?.(new PluginError(plugin.id, `\`${String(event)}\` handler threw`, error));
      }
    }
  }

  private collect<T>(pick: (contributions: PluginContributions) => T[] | undefined): T[] {
    return [...this.plugins.values()].flatMap((entry) => pick(entry.contributions) ?? []);
  }
}

export const createPluginRegistry = (): PluginRegistry => new PluginRegistry();
