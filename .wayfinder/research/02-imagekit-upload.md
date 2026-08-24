# ImageKit Upload — Next.js 16 / Offline-First PWA

Sources: [Next.js integration guide](https://imagekit.io/docs/integration/nextjs),
[client upload API](https://imagekit.io/docs/api-reference/upload-file-api/client-side-file-upload),
[server upload API](https://imagekit.io/docs/api-reference/upload-file-api/server-side-file-upload),
[GitHub: imagekit-developer/imagekit-next](https://github.com/imagekit-developer/imagekit-next)

---

## 1. Current SDK

**`@imagekit/next`** — the current package. `imagekitio-next` is the legacy package, superseded.

```bash
bun add @imagekit/next
```

Requires Next.js 13+. Confirmed working on 16 (this project).

### Minimal upload snippet (client component)

```ts
// components/InvoiceUpload.tsx
"use client"
import { upload, ImageKitAbortError, ImageKitServerError } from "@imagekit/next"

async function authenticator() {
  const res = await fetch("/api/upload-auth")
  if (!res.ok) throw new Error("Auth fetch failed")
  return res.json() // { token, expire, signature, publicKey }
}

export async function uploadInvoiceImage(file: File, folder: string) {
  const auth = await authenticator()
  return upload({
    file,
    fileName: file.name,
    folder,
    useUniqueFileName: true,
    ...auth, // token, expire, signature, publicKey
  })
  // returns { fileId, url, name, ... }
}
```

---

## 2. Auth — Route Handler + Env Vars

### Env vars (`.env.local`)

```
IMAGEKIT_PRIVATE_KEY=private_...        # server-only, never expose
IMAGEKIT_PUBLIC_KEY=public_...          # server-only, returned in auth response
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id   # client-safe
```

Three keys: private key, public key, URL endpoint. The URL endpoint is passed to
`ImageKitProvider` (or directly to `Image`/`Video` components) for URL construction.
It is not used by `getUploadAuthParams`.

### Route Handler (`app/api/upload-auth/route.ts`)

```ts
import { getUploadAuthParams } from "@imagekit/next/server"

export async function GET() {
  const { token, expire, signature } = getUploadAuthParams({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY!,
    // expire defaults to now + 3600s; pass expire: number to shorten
  })
  return Response.json({
    token,
    expire,
    signature,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  })
}
```

How it works: `getUploadAuthParams` generates a HMAC-SHA1 `signature` over
`token + expire`, signed with the private key. The client sends all four values
(`token`, `expire`, `signature`, `publicKey`) with each upload request. ImageKit
verifies the signature server-side. **Private key never leaves your server.**

---

## 3. Client-side vs Server-side Upload for Mobile PWA

**Recommendation: client-side upload** (direct browser → ImageKit).

| | Client-side | Server-side |
|---|---|---|
| Bandwidth | File goes direct; no double-hop | File hits your server first |
| Server cost | Auth endpoint only (~100B) | Full file proxied |
| Offline queue | Natural — browser holds blob, uploads direct on reconnect | Requires uploading to your server first |
| Auth | Short-lived token from your `/api/upload-auth` | Your server's private key used directly |

Server-side (`imagekit` Node SDK) is useful only when you need to transform the file
before storage or enforce server-side validation. For invoice photos from a mobile
PWA, client-side wins.

---

## 4. Folder / Naming Strategy

```
/invoices/{customerId}/{YYYY}/{MM}/{fileName}
```

Example:

```ts
upload({
  file,
  fileName: `inv-${Date.now()}.jpg`,   // or use file.name
  folder: `/invoices/${customerId}/${year}/${month}`,
  useUniqueFileName: true,             // default true — appends random suffix
  tags: [`customer:${customerId}`, `month:${year}-${month}`],
})
```

**ImageKit filename rules:** alphanumeric, `.`, `_`, `-` only — any other character
is replaced with `_` automatically.

**`useUniqueFileName: true` (default):** ImageKit appends a random suffix, so
`receipt.jpg` becomes `receipt_abc123.jpg`. Safe for deduplication but loses the
original name. Set `false` only when you control the name deterministically.

**`overwriteFile: true`** replaces the existing file at the same path. Combine
with `useUniqueFileName: false` and a stable filename (e.g. a UUID) for idempotent
re-uploads.

---

## 5. Offline Pattern — Queue, Upload on Reconnect, Patch `imageUrl`

### Recommended flow

```
[user captures image]
       ↓
Store blob in IndexedDB queue  { id, blob, metadata, status: 'pending' }
       ↓
navigator.onLine && queue.length > 0  →  drain queue
       ↓
fetch fresh /api/upload-auth          ← always fresh, never cache auth
       ↓
upload({ file: blob, ... })
       ↓
patch record.imageUrl = result.url    update DB/API with returned URL
       ↓
remove entry from IndexedDB queue
```

### IndexedDB queue skeleton

```ts
// lib/upload-queue.ts
import { openDB } from "idb"   // idb is a tiny IDB wrapper; or use raw IDB API

const DB = openDB("upload-queue", 1, {
  upgrade(db) { db.createObjectStore("pending", { keyPath: "id" }) },
})

export async function enqueue(id: string, blob: Blob, meta: Record<string, unknown>) {
  (await DB).put("pending", { id, blob, meta, addedAt: Date.now() })
}

export async function drainQueue(onUploaded: (id: string, url: string) => Promise<void>) {
  const db = await DB
  const all = await db.getAll("pending")
  for (const item of all) {
    const auth = await fetch("/api/upload-auth").then(r => r.json())  // always fresh
    const result = await upload({
      file: item.blob,
      fileName: `${item.id}.jpg`,
      folder: item.meta.folder as string,
      useUniqueFileName: false,   // deterministic — same id = same file
      overwriteFile: false,       // if already uploaded, ImageKit rejects → catch & treat as success
      ...auth,
    })
    await onUploaded(item.id, result.url)
    await db.delete("pending", item.id)
  }
}
```

### ImageKit gotchas for deferred upload

| Gotcha | Detail | Mitigation |
|---|---|---|
| **Auth token expiry** | `token`/`signature`/`expire` valid for ~1 hour (default) | Fetch `/api/upload-auth` immediately before each upload call, not at enqueue time |
| **Dedupe** | ImageKit has no built-in content-hash dedupe | Use a stable `fileName` (e.g. record UUID) + `useUniqueFileName: false` + `overwriteFile: false`; a 409-style error on duplicate means already uploaded — treat as success |
| **Unique filename dedupe risk** | `useUniqueFileName: true` uploads the same blob twice with different names | Don't use for queued retries; use deterministic filenames |
| **File size limit** | 25 MB per file on free plans; 300 MB on paid | Compress images client-side (`canvas.toBlob`) before enqueue |
| **No resumable upload** | ImageKit upload is a single multipart POST, not chunked | Keep invoice photos ≤ 5 MB; compress before enqueue |
| **Retry backoff** | Transient network errors during drain | Wrap upload in exponential backoff; leave item in queue on failure, retry next `online` event |

### Connectivity listener

```ts
window.addEventListener("online", () => {
  drainQueue(async (id, url) => {
    await patchInvoiceImageUrl(id, url)   // your API call
  })
})
```
