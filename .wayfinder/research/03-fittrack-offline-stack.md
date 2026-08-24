# 03 — FitTrack Offline-First Stack Research

> Source: `C:\Users\Darren\Desktop\Projects\FitTrack`
> Ticket: `.wayfinder/tickets/03-fittrack-offline-stack.md`

---

## 1. TanStack Query Persist Setup

**File:** `app/providers.tsx`

- **Provider:** `PersistQueryClientProvider` from `@tanstack/react-query-persist-client`
- **Persister:** `createSyncStoragePersister({ storage: window.localStorage })` — guarded with `typeof window !== 'undefined'` (line 27–31)
- **gcTime:** `5 * 60 * 1000` (5 min) — `QueryClient.defaultOptions.queries.gcTime` (line 13)
- **maxAge:** `1000 * 60 * 60 * 24` (24 hours) — `persistOptions.maxAge` (line 41)
- **networkMode:** `'offlineFirst'` on both `queries` and `mutations` (lines 18, 21)
- **retry:** 3 with exponential backoff capped at 30s (lines 14–15) for queries; 3 for mutations (line 23)
- **dehydrate:** default (no custom `shouldDehydrateQuery` filter)
- **queryClient** is module-level (not in `useState`); `trpcClient` is in `useState` (line 34)
- Falls back to plain `QueryClientProvider` when `window` is not available (SSR)

---

## 2. Serwist PWA

### `next.config.ts` (lines 1–13)
```ts
import withSerwist from "@serwist/next";
export default withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
})(nextConfig);
```

### `app/sw.ts` — Service Worker

- **Precache:** `self.__SW_MANIFEST` (auto-injected by Serwist build)
- `skipWaiting: true`, `clientsClaim: true`, `navigationPreload: true`
- **Offline fallback:** URL `/offline` for all `request.destination === "document"` requests (line 28–33)

| Route | Strategy | Cache Name | TTL |
|-------|----------|------------|-----|
| `fonts.gstatic.com` | CacheFirst | `google-fonts-webfonts` | 1 year |
| `fonts.googleapis.com` | StaleWhileRevalidate | `google-fonts-stylesheets` | 1 week |
| Images (by destination) | StaleWhileRevalidate | `static-image-assets` | 30 days |
| `.js` / `.css` | StaleWhileRevalidate | `static-js-css-assets` | 1 week |
| `/_next/data/**/*.json` | StaleWhileRevalidate | `next-data` | 1 day |
| `/api/trpc` GET only | NetworkFirst | `trpc-api-cache` | 5 min, 10s timeout |
| navigate (HTML pages) | NetworkFirst | `pages-cache` | 1 day, 10s timeout |
| Everything else | `defaultCache` (Serwist built-in) | — | — |

Note: tRPC **POST** (mutations) are **not** cached by the SW — they go through the write queue in the tRPC client instead.

### `app/offline/page.tsx`
Simple "You're Offline" card with `navigator.onLine` listener and a reload button (disabled while offline).

### `public/manifest.json`
PWA manifest: `display: "standalone"`, `theme_color: "#3b82f6"`, 4 icon sizes (96/192/512/180px), 4 shortcuts (timer, calendar, movements, routines), `share_target`.

---

## 3. Offline Write Queue (real queue — not TanStack retry)

**File:** `lib/trpc/client.ts` (lines 9–31 and 37–50)

FitTrack implements a **real module-level write queue**, not just TanStack retry + persistence:

```ts
// Module-level queue (survives React re-renders, lost on page reload)
const mutationQueue: Array<{ url: string; options: RequestInit }> = [];

// Custom fetch in httpBatchLink intercepts offline POSTs
fetch: async (url, options) => {
  if (!isOnline() && options?.method === 'POST') {
    mutationQueue.push({ url: url.toString(), options });
    throw new Error('OFFLINE_QUEUED');   // causes TanStack to mark mutation failed
  }
  return fetch(url, options);
},

// Flush on reconnect
window.addEventListener('online', async () => {
  while (mutationQueue.length > 0) {
    const queued = mutationQueue.shift();
    try {
      await fetch(queued.url, queued.options);
    } catch {
      mutationQueue.unshift(queued); // re-queue, stop processing
      break;
    }
  }
});
```

**Limitation:** queue is in-memory only — it's lost on page reload. There is no IndexedDB/localStorage backing for the mutation queue. The Zustand `sessionDraftStore` (see below) is the durable write buffer for workout logs specifically.

### Mutation Pattern in Components
Components do **not** use `onMutate` / cache rollback. Pattern is `onSuccess: invalidate → onError: toast`. Example: `app/routines/page.tsx` lines 21–39, `components/calendar/SessionDrawer.tsx` lines 107–129.

---

## 4. Zustand Stores

All three stores use `zustand/middleware` `persist` (localStorage).

| Store | Key | Contents | Purpose |
|-------|-----|----------|---------|
| `authStore.ts` | `fittrack-auth` | `userId`, `username`, `isAuthenticated` | Client-only auth state; replaces JWT in React context |
| `sessionDraftStore.ts` | `fittrack-session-drafts` | `drafts: Record<sessionId, { logs, timestamp }>` | Durable write buffer — persists in-progress workout logs to localStorage until synced to DB |
| `timerStore.ts` | `fittrack-timer-v2` | Timer + stopwatch state/actions | Pure UI state; uses `partialize` to exclude running flags (only persists duration/elapsed when paused) |

`sessionDraftStore` is the closest thing to a durable offline write queue for user data. The flow is: user logs sets → Zustand draft → on session complete, tRPC mutation fires; if offline, the draft survives page reload and the user can retry.

---

## 5. tRPC + superjson + React Query Wiring

### `lib/trpc/client.ts`
- `createTRPCReact<AppRouter>()` → exported as `trpc`
- `getTRPCClient()` returns `trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc', transformer: superjson, fetch: customOfflineFetch })] })`

### `server/trpc.ts`
- `initTRPC.context<Context>().create({ transformer: superjson })`
- Exports: `router`, `publicProcedure`, `protectedProcedure` (the latter uses `isAuthed` middleware checking `ctx.userId`)

### `app/providers.tsx`
```
trpc.Provider
  └── PersistQueryClientProvider (with localStorage persister, maxAge 24h)
        └── {children}
```

---

## 6. Exact Package Versions (offline-relevant subset)

```json
"@serwist/next": "^9.5.0",
"@serwist/sw": "^9.5.0",
"serwist": "^9.5.0",
"@tanstack/query-sync-storage-persister": "^5.90.19",
"@tanstack/react-query": "^5.90.11",
"@tanstack/react-query-persist-client": "^5.90.19",
"@trpc/client": "^11.7.2",
"@trpc/next": "^11.7.2",
"@trpc/react-query": "^11.7.2",
"@trpc/server": "^11.7.2",
"superjson": "^2.2.6",
"zustand": "^5.0.8",
"next": "16.0.10"
```

---

## 7. How to Mirror in toko-sinar-harapan

- [ ] **Install packages:** Add the 13 packages above at the exact versions listed.
- [ ] **`app/sw.ts`:** Copy Serwist SW verbatim; adjust `runtimeCaching` routes to match toko's API path (if not `/api/trpc`, update the tRPC GET matcher). Keep the `/offline` fallback.
- [ ] **`next.config.ts`:** Wrap with `withSerwist({ swSrc: "app/sw.ts", swDest: "public/sw.js", disable: process.env.NODE_ENV === "development", reloadOnOnline: true })`.
- [ ] **`app/offline/page.tsx`:** Create the offline fallback page (can copy verbatim; reskin to toko brand).
- [ ] **`public/manifest.json`:** Create manifest with toko branding; link it in `app/layout.tsx` via `<link rel="manifest">`.
- [ ] **`lib/trpc/client.ts`:** Add module-level `mutationQueue`, custom `fetch` interceptor, and `window.addEventListener('online', ...)` flush logic. If durability across reloads matters, back the queue with localStorage instead of a plain array.
- [ ] **`app/providers.tsx`:** Replace `QueryClientProvider` with `PersistQueryClientProvider`; create `createSyncStoragePersister({ storage: window.localStorage })`; set `gcTime: 5 * 60 * 1000` and `maxAge: 24 * 60 * 60 * 1000`; set `networkMode: 'offlineFirst'` on both queries and mutations.
- [ ] **`server/trpc.ts`:** Add `transformer: superjson` to `initTRPC.create(...)`.
- [ ] **Zustand stores:** Create toko equivalents:
  - Auth store (if using client-side auth state)
  - A draft/buffer store for any data that should survive offline page reloads before sync
  - Any UI-only ephemeral state (timers, UI flags) with `partialize` to exclude transient fields
- [ ] **Decision point — mutation queue durability:** FitTrack's in-memory queue is lost on page reload. For toko, consider backing it with `localStorage` (serialize the queue on push, deserialize on `online` event) if offline mutation durability past a reload matters.
- [ ] **No optimistic `onMutate` needed** (FitTrack doesn't use it): `onSuccess: invalidate → onError: toast` is the pattern; rely on Zustand drafts for offline read-back.
