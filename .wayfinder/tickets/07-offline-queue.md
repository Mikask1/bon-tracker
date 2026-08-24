---
id: 07
title: "Decide: Offline mutation queue + optimistic sync strategy"
type: grilling
status: resolved
assignee: Mikask
blocked_by: [03, 04]
blocks: []
---

## Question

The hard part of offline-first here: creating an invoice offline involves an **image
upload (ImageKit)** and a **Gemini extraction** — both need network. Decide the strategy.

Decide:
- Where extraction runs: online-only (user must be online to scan) with manual entry as
  the offline fallback? Or queue the photo and extract on reconnect (form fills later)?
- Write queue: reuse TanStack Query persistence + retry (per FitTrack, ticket 03), or a
  dedicated durable queue (IndexedDB) for pending invoices + pending image uploads?
- Optimistic flow: invoice appears in the list immediately with local image + temp ID
  (ticket 05), `syncStatus: pending`; on reconnect → upload image → save → swap in real
  `imageUrl` + server ID. Order of operations + rollback on failure.
- Conflict/dedupe: avoid double-submit when connection flaps.
- Surface sync state in UI (pending badge?) — hand to prototype (08).

Depends on 03 (what FitTrack already gives us) and 04 (sync fields).

## Answer

Scan is online-only (per 01/02 decision) → the offline flow is only **manual invoice
create/edit**, no photo. That removes durable image-blob storage entirely (offline invoices
carry no blob; `imageUrl=''`, `imagePending=false`; images attach only during the online
scan flow).

- **Extraction**: online-only. Offline, the `+` opens the manual form (no camera-extract).
- **Durable write queue**: a Zustand `persist` (localStorage) store `pendingInvoiceStore`
  keyed by `localId` — mirrors FitTrack's `sessionDraftStore` pattern, but this is the
  authoritative queue (FitTrack's link-level queue is in-memory and lost on reload; we do
  NOT rely on it for creates). Payloads are small JSON, so localStorage is fine.
- **Optimistic flow**: on save, invoice goes into `pendingInvoiceStore` + the TanStack cache
  immediately with `syncStatus:'pending'` and temp label (ticket 05). List = server cache
  ∪ pending store, **deduped by `localId`**.
- **Flush**: on `window 'online'` + on app load, replay pending creates FIFO via the tRPC
  create mutation. Server assigns `invoiceId` (05), returns the synced doc → update cache by
  `localId`, remove from pending store.
- **Dedupe / idempotency**: unique index on `localId`; server upserts by `localId` so a
  double-flush (connection flap) is idempotent, never a duplicate invoice.
- **Rollback**: on server error keep the item in the queue, mark `syncStatus:'error'`, toast;
  retry on next online/flush. No optimistic cache rollback needed (item stays visible as
  pending/error).
- **Serwist**: mirror FitTrack — SWR for assets, NetworkFirst + `/offline` for pages,
  tRPC POSTs not SW-cached (the durable queue owns writes).
- **UI**: list shows a per-row sync badge (pending / error / synced) — hand to prototype (08).

Depends on: 03 (FitTrack mechanism), 04 (sync fields). Feeds 08 (sync badge UI).
