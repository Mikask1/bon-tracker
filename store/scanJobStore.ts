import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExtractedInvoice } from '@/types/invoice';

// Background scan jobs. A job is created only AFTER the image is uploaded, so it
// holds just the ImageKit URL (a short string) — never the photo bytes. That makes
// it cheap to persist (localStorage) and resumable: on reload, a 'scanning' job is
// re-scanned server-side straight from its URL.
export interface ScanJob {
  localId: string;
  status: 'scanning' | 'done' | 'error';
  imageUrl: string; // uploaded ImageKit URL — all a job needs
  imageHash?: string; // SHA-256 of photo bytes — saved onto the invoice for dedupe
  extracted?: ExtractedInvoice;
  error?: string;
  createdAt: string; // ISO
}

interface ScanJobState {
  jobs: Record<string, ScanJob>;
  add: (job: ScanJob) => void;
  update: (localId: string, patch: Partial<ScanJob>) => void;
  remove: (localId: string) => void;
}

export const useScanJobStore = create<ScanJobState>()(
  persist(
    (set) => ({
      jobs: {},
      add: (job) => set((s) => ({ jobs: { ...s.jobs, [job.localId]: job } })),
      update: (localId, patch) =>
        set((s) =>
          s.jobs[localId]
            ? { jobs: { ...s.jobs, [localId]: { ...s.jobs[localId], ...patch } } }
            : s
        ),
      remove: (localId) =>
        set((s) => {
          const next = { ...s.jobs };
          delete next[localId];
          return { jobs: next };
        }),
    }),
    { name: 'tsh-scan-jobs' }
  )
);
