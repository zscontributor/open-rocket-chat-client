import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initI18n } from './i18n';
import { createCachePersister, PERSIST_MAX_AGE_MS, shouldPersistQuery } from './lib/persist';
import { queryClient, queryKeys } from './lib/query';
import './styles.css';

// The SDK fires this when any call comes back unauthorised, so an expired
// session drops straight to the login screen instead of showing stale rooms.
window.addEventListener('orc:unauthenticated', () => {
  queryClient.setQueryData(queryKeys.session, null);
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// Translations are resolved before the first render; mounting first would show
// a flash of raw keys on a slow device.
void initI18n().then(() => {
  createRoot(container).render(
    <StrictMode>
      {/* Rooms, messages and server capabilities are restored from IndexedDB
          before the first fetch resolves, so a reload — or a cold start on a
          slow connection — opens on the conversation rather than a spinner. */}
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: createCachePersister(),
          maxAge: PERSIST_MAX_AGE_MS,
          // Restoring a cache written by an older build would feed components
          // fields they no longer expect; the buster forces a cold start.
          buster: import.meta.env.VITE_BUILD_ID ?? 'dev',
          dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </StrictMode>,
  );
});
