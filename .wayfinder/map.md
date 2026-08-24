# Wayfinder Map: Toko Sinar Harapan — Invoice Tracker

`wayfinder:map` · tracker: local-markdown · dev: Mikask (darren)

## Destination

A working, mobile-first, offline-first invoice tracking web app mirroring FitTrack's
architecture (Next 16 + tRPC + mongoose/MongoDB + zod + shadcn/ui + zustand + TanStack
Query persist + Serwist PWA). Flow: photograph an invoice → Gemini vision extracts →
prefilled editable form → set status (Lunas / Belum Lunas + unpaid amount) → save.
Home = a list of invoices (columns: Pembeli [name/address/phone stacked], Grand Total,
status, ID) with a single `+` FAB. Images on ImageKit.io. Invoice IDs `YYMMDD-<hex>`.

**Execution override:** this effort carries execution into the map (not plan-only). Once
decision/research tickets close, build tickets graduate from the fog.

## Notes

- **Mirror** `C:\Users\Darren\Desktop\Projects\FitTrack` — same stack, folder layout
  (`app/`, `server/routers/`, `lib/models/`, `lib/db.ts`, `store/`, `types/`,
  `components/ui/`), tRPC + superjson, zod validators, shadcn/ui, sonner.
- **This is NOT the Next.js you know** (see AGENTS.md): Next 16.3.2 — read
  `node_modules/next/dist/docs/` before writing framework code. FitTrack runs 16.0.10;
  verify diffs.
- **Standing constraints (apply to every ticket):**
  - **Mobile-first** UI. Thumb-reachable FAB, camera capture, stacked layouts.
  - **Offline-first**: cache everything, optimistic writes, queue + sync later.
  - `bun`/`bunx` tooling. Subagents run `sonnet` unless approved otherwise.
- **Skills to consult:** `domain-modeling` (data model), `grilling` + `prototype` (UX),
  `research` (library facts).
- Locked decisions (from charting): MongoDB · single-password auth · Gemini
  `@google/genai` vision, editable prefilled form · ImageKit.io images · ID `YYMMDD-<hex>`.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Research: Gemini @google/genai vision](tickets/01-gemini-vision.md): model
  `gemini-2.5-flash` (2.0-flash dead); image = inline base64; structured output via
  `config.responseSchema` + `Type` from `@google/genai`; env `GEMINI_API_KEY`; schema
  guarantees valid JSON, missing fields → zero-values. Snippet in `research/01-gemini-vision.md`.
- [Research: ImageKit.io upload](tickets/02-imagekit-upload.md): SDK `@imagekit/next`;
  client-side upload with server-signed auth (`getUploadAuthParams`, private key server-only);
  fetch fresh auth at upload time (~1h TTL); deterministic filename + `useUniqueFileName:false`
  + `overwriteFile:false` = safe offline-retry dedupe. Details in `research/02-imagekit-upload.md`.
- [Research: FitTrack offline-first stack](tickets/03-fittrack-offline-stack.md): 3 layers —
  TanStack Query persist (localStorage, `networkMode:'offlineFirst'`) + Serwist SW
  (SWR/NetworkFirst, tRPC POSTs not cached) + a custom fetch write-queue in
  `lib/trpc/client.ts` that flushes FIFO on `online`. **Queue is in-memory (lost on
  reload); durable offline data uses a Zustand-`persist` draft store.** No optimistic
  rollback. Mirror checklist + 13 pkgs in `research/03-fittrack-offline-stack.md`.
  → toko invoices must survive reload ⇒ **durable queue required** (feeds ticket 07).

- [Decide: Invoice data model](tickets/04-data-model.md): `Item{itemName, itemQty(decimal>0),
  unitPrice(int Rp)}`; `Buyer{name?, address(required), phoneNumber?}`;
  `Invoice{invoiceId, buyer, items[≥1], grandTotal(stored int Rp = round(Σ qty*price)),
  status LUNAS|BELUM_LUNAS, unpaidAmount, imageUrl, +sync: localId/syncStatus/imagePending}`.
  Rules: BELUM_LUNAS ⇒ 0<unpaid≤total (defaults =total); LUNAS ⇒ unpaid=0; totals recomputed
  server-side. Full schema in the ticket.

- [Decide: Invoice ID](tickets/05-invoice-id.md): `YYMMDD-<hex>`, YYMMDD from client
  `createdAt`, `<hex>` = **global** lowercase running counter (mongo counter doc `$inc`,
  never resets). Server assigns **on sync**; offline shows temp label + pending badge.
  `localId` = durable/dedupe key, `invoiceId` = display + secondary lookup.
- [Decide: Auth](tickets/06-auth.md): env `APP_PASSWORD` checked server-side → JWT
  httpOnly cookie **30d**; `protectedProcedure` via tRPC context (reuse FitTrack
  `lib/utils/jwt.ts`). First login online; cookie + persisted cache serve offline after.
  Drop User model / registration / bcrypt.
- [Decide: Offline queue](tickets/07-offline-queue.md): scan online-only ⇒ offline = manual
  create only, **no photo** (no durable blobs). Durable queue = Zustand-`persist` store keyed
  by `localId` (FitTrack's queue is in-memory, not reused for creates). Optimistic add +
  pending badge; flush FIFO on `online`; server upsert by `localId` (unique index) =
  idempotent; keep-in-queue on error.

## Not yet specified (fog)

- **Build/execution tickets** — model + sync + auth + ID all decided ⇒ **ready to graduate**.
  Likely slices: (1) scaffold stack into toko (port FitTrack tRPC/db/superjson/shadcn/
  providers), (2) auth (env password + JWT cookie + protectedProcedure), (3) Invoice model +
  mongoose + zod + counter doc, (4) tRPC invoice router (list/create/update), (5) offline
  queue store + optimistic list + flush, (6) manual form + Gemini scan (online) + ImageKit
  upload, (7) PWA/Serwist. Graduate after the UI prototype (08) fixes the surface.
- **PWA/Serwist setup** — mirror FitTrack's `app/sw.ts` + `@serwist/next`. Sharpens after
  offline-sync strategy (Offline mutation queue) is decided.
- **Camera capture** — mobile `<input capture>` vs file upload; how capture feeds the
  offline queue. Sharpens after capture/form prototype.

## Out of scope

<!-- work ruled beyond the destination -->

## Tickets

<!-- index of child tickets; open ones are the frontier, found in tickets/ -->

- [01 — Research: Gemini @google/genai vision extraction contract](tickets/01-gemini-vision.md) · research · **closed**
- [02 — Research: ImageKit.io upload in Next 16 (+ offline behaviour)](tickets/02-imagekit-upload.md) · research · **closed**
- [03 — Research: FitTrack offline-first stack (persist + Serwist + optimistic)](tickets/03-fittrack-offline-stack.md) · research · **closed**
- [04 — Decide: Invoice data model (mongoose + zod + sync fields)](tickets/04-data-model.md) · grilling · **closed**
- [05 — Decide: Invoice ID `YYMMDD-<hex>` generation + offline reconciliation](tickets/05-invoice-id.md) · grilling · **closed**
- [06 — Decide: Single-password auth + offline session](tickets/06-auth.md) · grilling · **closed**
- [07 — Decide: Offline mutation queue + optimistic sync strategy](tickets/07-offline-queue.md) · grilling · **closed**
- [08 — Prototype: Mobile-first list + FAB + capture/form UX](tickets/08-ui-prototype.md) · prototype · **closed** *(folded into build)*

## Build (executed this session)

Destination reached — app scaffolded from the FitTrack mirror and **`bun run build` passes**
(routes: `/`, `/api/trpc/[trpc]`, `/api/upload-auth`, `/offline`; service worker bundled).

- Stack ported: tRPC v11 + superjson, mongoose, TanStack Query persist, Serwist PWA,
  shadcn/ui, sonner, zustand. `build` script set to `next build --webpack` (Serwist has no
  Turbopack support).
- `lib/models/{Invoice,Counter}` · `lib/utils/{jwt,invoiceId}` · `lib/{db,gemini,format}`
- `server/routers/{auth,invoices}` (invoices: list/create/update/scan; create is idempotent
  by `localId`)
- `store/{authStore,pendingInvoiceStore}` + `components/SyncManager` (durable offline queue)
- `components/{LoginGate,InvoiceForm,InvoiceList}` + `app/page.tsx` (mobile-first, FAB, drawer)
- `app/api/{trpc,upload-auth}` · `app/{layout,providers,offline}` · `next.config` (serwist) ·
  `public/manifest.json` · `.env.example`

**Known ceilings (ponytail):** edit-existing-invoice not wired (create only); offline invoices
carry no photo (scan is online-only, by decision 07); password compared as env plaintext;
PWA icons (`icon-192/512.png`) referenced in manifest but not yet added.

**To run:** fill `.env.local` (real `MONGODB_URL`, `GEMINI_API_KEY`, ImageKit keys,
`APP_PASSWORD`, `JWT_SECRET`) → `bun dev`.
