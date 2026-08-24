'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';

// Drains the durable pending-invoice queue whenever we're online (on mount, on the
// `online` event, and whenever a new invoice is enqueued). Idempotent server-side
// (dedupe by localId), so a re-run never duplicates.
export function SyncManager() {
  const utils = trpc.useUtils();
  const createMutation = trpc.invoices.create.useMutation();
  const draining = useRef(false);

  useEffect(() => {
    async function drain() {
      if (draining.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const pending = Object.values(usePendingStore.getState().items).filter(
        (p) => p.syncStatus === 'pending'
      );
      if (pending.length === 0) return;

      draining.current = true;
      try {
        for (const p of pending) {
          try {
            await createMutation.mutateAsync(p.input);
            usePendingStore.getState().remove(p.input.localId);
          } catch (e) {
            usePendingStore
              .getState()
              .markError(p.input.localId, e instanceof Error ? e.message : 'Gagal sinkron');
          }
        }
        await utils.invoices.list.invalidate();
      } finally {
        draining.current = false;
      }
    }

    drain();
    window.addEventListener('online', drain);
    const unsub = usePendingStore.subscribe(() => drain());
    return () => {
      window.removeEventListener('online', drain);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
