---
id: 03
title: "Research: FitTrack offline-first stack (persist + Serwist + optimistic)"
type: research
status: resolved
assignee:
blocked_by: []
blocks: []
---

## Question

Read `C:\Users\Darren\Desktop\Projects\FitTrack` and document exactly how it does
offline-first, so we can mirror it. This is codebase research, not the web.

Resolve, with file:line pointers:
- TanStack Query persist setup: `@tanstack/react-query-persist-client` +
  `query-sync-storage-persister` — where configured (`app/providers.tsx`?), what storage,
  gcTime/maxAge, dehydrate/hydrate.
- Serwist PWA: `app/sw.ts`, `@serwist/next` in `next.config.ts`, precache/runtime caching
  strategy, `app/offline/page.tsx`.
- Optimistic mutations: how a tRPC mutation does `onMutate` / cache update / rollback.
  Is there a write queue for offline, or does it rely on TanStack retry + persistence?
- Zustand stores (`store/*`) — what's client-only state vs server cache.
- The exact package set + versions to port.

Produce a concise "how to mirror" checklist for the toko app.

## Answer

See `.wayfinder/research/03-fittrack-offline-stack.md` for full findings with file:line pointers.
