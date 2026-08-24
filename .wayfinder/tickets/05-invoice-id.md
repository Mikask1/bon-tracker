---
id: 05
title: "Decide: Invoice ID YYMMDD-<hex> generation + offline reconciliation"
type: grilling
status: resolved
assignee: Mikask
blocked_by: [04]
blocks: []
---

## Question

Format is `YYMMDD-<hex>` (e.g. `240826-1a`). Nail the hex + how it survives offline-first.

Decide:
- What does `<hex>` count — per-day sequence (reset each day) or a global running counter
  rendered in hex? Uppercase/lowercase? Zero-padded width or free-growing?
- Server generation must be atomic (concurrent saves): mongo counter doc + `findOneAndUpdate`
  `$inc`, or derive from same-day count. Pick one.
- **Offline reconciliation**: an invoice created offline has no server hex yet. Options —
  (a) show a temp/local label until sync assigns the real ID on server write, or (b) client
  generates a provisional ID and server may rewrite on conflict. Which, and what the user
  sees in the list meanwhile.
- Is the ID user-visible-only (display) or also a lookup key / URL slug?

Depends on model (04) for where the id/sync fields live.

## Answer

**Format** `YYMMDD-<hex>`: `YYMMDD` = the invoice's creation date (from client `createdAt`
in the payload, so the date reflects when it was made, not when it synced); `<hex>` = a
**global running counter** in lowercase hex, never resets, no fixed padding (grows
naturally: `1`,`2`,…,`a`,…,`3e8`). Globally unique on the hex alone; the date is just a
readable prefix. e.g. `240826-3e7`.

**Generation — server, atomic.** Mongo counter doc:
`db.counters.findOneAndUpdate({_id:'invoice'}, {$inc:{seq:1}}, {upsert:true, returnDocument:'after'})`
→ `hex = seq.toString(16)`. Concurrency-safe. Runs only when the server persists the invoice.

**Offline reconciliation.** Server assigns the ID **on sync** (ticket 07). An offline
invoice has no `invoiceId` yet → the list shows a temp label (its `localId` short / "Draft")
with a pending badge. On sync the server assigns `YYMMDD-<hex>` (YYMMDD from the stored
`createdAt`) and the row swaps to the real ID.

**Keys.** `localId` (client uuid) is the durable key across sync + the dedupe key
(ticket 07). `invoiceId` is human-facing display + a secondary unique lookup once assigned.

Depends on: model (04) — id/sync fields; feeds sync flow (07).
