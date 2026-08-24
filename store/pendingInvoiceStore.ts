import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InvoiceInput } from '@/types/invoice';

// Durable offline write-queue for CREATES, keyed by localId. Survives reloads
// (localStorage) — unlike FitTrack's in-memory link queue. SyncManager drains it.
export interface PendingInvoice {
  input: InvoiceInput; // createdAt is a Date at write time; a string after rehydrate
  syncStatus: 'pending' | 'error';
  error?: string;
}

interface PendingState {
  items: Record<string, PendingInvoice>;
  enqueue: (input: InvoiceInput) => void;
  markError: (localId: string, error: string) => void;
  remove: (localId: string) => void;
  list: () => PendingInvoice[];
}

export const usePendingStore = create<PendingState>()(
  persist(
    (set, get) => ({
      items: {},
      enqueue: (input) =>
        set((s) => ({
          items: {
            ...s.items,
            [input.localId]: { input, syncStatus: 'pending' },
          },
        })),
      markError: (localId, error) =>
        set((s) => {
          const cur = s.items[localId];
          if (!cur) return s;
          return {
            items: { ...s.items, [localId]: { ...cur, syncStatus: 'error', error } },
          };
        }),
      remove: (localId) =>
        set((s) => {
          const next = { ...s.items };
          delete next[localId];
          return { items: next };
        }),
      list: () => Object.values(get().items),
    }),
    { name: 'tsh-pending' }
  )
);
