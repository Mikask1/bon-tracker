'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc, getTRPCClient } from '@/lib/trpc/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Toaster } from '@/components/ui/sonner';
import { SyncManager } from '@/components/SyncManager';

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

  const inner = (
    <>
      {children}
      <SyncManager />
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
