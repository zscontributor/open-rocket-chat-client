import { describe, expect, it, vi } from 'vitest';

import type { Plugin, PluginHost } from '../contributions.js';
import { createPluginRegistry, PluginError } from '../registry.js';

const host: PluginHost = { client: {}, capabilities: {}, locale: 'en' };

const Icon = () => null;

const plugin = (
  id: string,
  contributions: Plugin['setup'] extends never ? never : Parameters<never>[0] | object = {},
): Plugin => ({
  id,
  name: id,
  version: '1.0.0',
  setup: () => contributions,
});

describe('registration', () => {
  it('collects contributions from every plugin', async () => {
    const registry = createPluginRegistry();

    await registry.registerAll(
      [
        plugin('a', { messageActions: [{ id: 'a1', label: 'A', icon: Icon, onSelect: () => undefined, order: 20 }] }),
        plugin('b', { messageActions: [{ id: 'b1', label: 'B', icon: Icon, onSelect: () => undefined, order: 10 }] }),
      ],
      host,
    );

    expect(registry.list().map((entry) => entry.id)).toEqual(['a', 'b']);
    // Ordered across plugins, not grouped by the plugin that supplied them.
    expect(registry.messageActions().map((action) => action.id)).toEqual(['b1', 'a1']);
  });

  it('rejects a duplicate id rather than silently shadowing', async () => {
    const registry = createPluginRegistry();
    await registry.register(plugin('dup'), host);

    await expect(registry.register(plugin('dup'), host)).rejects.toBeInstanceOf(PluginError);
  });

  it('isolates a plugin that throws during setup', async () => {
    const registry = createPluginRegistry();

    const broken: Plugin = {
      id: 'broken',
      name: 'Broken',
      version: '1.0.0',
      setup: () => {
        throw new Error('boom');
      },
    };

    const errors = await registry.registerAll(
      [broken, plugin('good', { sidebarItems: [{ id: 's', label: 'S', icon: Icon, onSelect: () => undefined }] })],
      host,
    );

    // An optional extension must never stop someone reading their messages.
    expect(errors).toHaveLength(1);
    expect(errors[0]?.pluginId).toBe('broken');
    expect(registry.list().map((entry) => entry.id)).toEqual(['good']);
    expect(registry.sidebarItems()).toHaveLength(1);
  });

  it('reports setup failures for a diagnostics view', async () => {
    const registry = createPluginRegistry();
    await registry.registerAll(
      [
        {
          id: 'bad',
          name: 'Bad',
          version: '1.0.0',
          setup: () => {
            throw new Error('nope');
          },
        },
      ],
      host,
    );

    expect(registry.errors().map((error) => error.pluginId)).toEqual(['bad']);
  });

  it('drops a plugin on unregister', async () => {
    const registry = createPluginRegistry();
    await registry.register(
      plugin('temp', { composerActions: [{ id: 'c', label: 'C', icon: Icon, onSelect: () => undefined }] }),
      host,
    );

    registry.unregister('temp');

    expect(registry.list()).toEqual([]);
    expect(registry.composerActions()).toEqual([]);
  });
});

describe('events', () => {
  it('delivers to every plugin that listens', async () => {
    const registry = createPluginRegistry();
    const first = vi.fn();
    const second = vi.fn();

    await registry.registerAll(
      [plugin('a', { events: { onRoomOpened: first } }), plugin('b', { events: { onRoomOpened: second } })],
      host,
    );

    registry.emit('onRoomOpened', (handler) => handler({} as never, {} as never));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps delivering after one handler throws', async () => {
    const registry = createPluginRegistry();
    const survivor = vi.fn();
    const onError = vi.fn();

    await registry.registerAll(
      [
        plugin('throws', {
          events: {
            onRoomOpened: () => {
              throw new Error('boom');
            },
          },
        }),
        plugin('fine', { events: { onRoomOpened: survivor } }),
      ],
      host,
    );

    registry.emit('onRoomOpened', (handler) => handler({} as never, {} as never), onError);

    expect(survivor).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(PluginError);
  });
});
