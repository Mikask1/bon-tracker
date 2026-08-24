'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { trpc, getTRPCClient } from '@/lib/trpc/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Toaster } from '@/components/ui/sonner';
import { SyncManager } from '@/components/SyncManager';
import { FontScaleApplier } from '@/components/FontScale';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000, // 24h — persisted cache serves the list offline
      retry: 2,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

const persister =
  typeof window !== 'undefined'
    ? createSyncStoragePersister({ storage: window.localStorage })
    : undefined;

export function Providers({ children }: { children: React.ReactNode }) {
  const [trpcClient] = useState(() => getTRPCClient());

  // In dev the SW is disabled, so a SW left registered by a prior `next build` keeps
  // serving its stale precached bundle (which batches mutations as GET → 405). Kill it.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    navigator.serviceWorker?.getRegistrations().then((regs) => {
      if (regs.length === 0) return;
      Promise.all(regs.map((r) => r.unregister()))
        .then(() => caches?.keys())
        .then((keys) => Promise.all((keys ?? []).map((k) => caches.delete(k))))
        .then(() => location.reload());
    });
  }, []);

  const inner = (
    <>
      {children}
      <SyncManager />
      <FontScaleApplier />
      <Toaster position="top-center" richColors />
    </>
  );

  if (persister) {
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          {inner}
        </PersistQueryClientProvider>
      </trpc.Provider>
    );
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>
    </trpc.Provider>
  );
}
