import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The bar reads the viewport through the UI store, which measures the window
// and reads localStorage as it is created — neither exists under node.
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 });
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});

type Store = typeof import('../store');
let store: Store;

beforeAll(async () => {
  store = await import('../store');
});

beforeEach(() => {
  store.useContextualBarStore.setState({ stack: [] });
});

const state = () => store.useContextualBarStore.getState();

describe('coming back from a result opened out of the search panel', () => {
  it('keeps the term and the scroll offset on the entry it came from', () => {
    state().open({ id: 'search' });
    state().rememberSearch({ term: 'from:alice deploy', scrollTop: 240 });
    state().push({ id: 'thread', messageId: 'msg1' });

    state().back();

    expect(state().stack).toEqual([{ id: 'search', term: 'from:alice deploy', scrollTop: 240 }]);
  });

  it('leaves the stack alone when the search panel is no longer on screen', () => {
    state().open({ id: 'members' });
    state().rememberSearch({ term: 'deploy', scrollTop: 240 });

    expect(state().stack).toEqual([{ id: 'members' }]);
  });

  it('starts clean when search is opened again from the toolbar', () => {
    state().open({ id: 'search' });
    state().rememberSearch({ term: 'deploy', scrollTop: 240 });
    state().push({ id: 'thread', messageId: 'msg1' });

    // Not a back — the toolbar has no history, so this is a new search.
    state().toggle({ id: 'search' });

    expect(state().stack).toEqual([{ id: 'search' }]);
  });
});
