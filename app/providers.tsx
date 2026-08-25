'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { trpc, getTRPCClient } from '@/lib/trpc/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { ImageKitProvider } from '@imagekit/next';
import { Toaster } from '@/components/ui/sonner';
import { SyncManager } from '@/components/SyncManager';
import { FontScaleApplier } from '@/components/FontScale';

// Every stored imageUrl is already an absolute ik.imagekit.io URL (returned by the
// upload API), so this endpoint is never actually used to build a path — it only
// satisfies the provider's required-prop check. Set NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
// to your real ImageKit URL endpoint if that ever changes.
const IMAGEKIT_URL_ENDPOINT =
  process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io';

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
    <ImageKitProvider urlEndpoint={IMAGEKIT_URL_ENDPOINT}>
      {children}
      <SyncManager />
      <FontScaleApplier />
      <Toaster position="top-center" richColors />
    </ImageKitProvider>
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
