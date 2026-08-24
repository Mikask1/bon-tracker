---
id: 02
title: "Research: ImageKit.io upload in Next 16 (+ offline behaviour)"
type: research
status: resolved
assignee:
blocked_by: []
blocks: []
---

## Question

How do we upload invoice photos to ImageKit.io from a Next 16 app, and how does that
behave under offline-first?

Resolve:
- Client-side vs server-side upload. ImageKit needs a signed auth (signature/token/expire)
  — where does the auth endpoint live (tRPC procedure vs route handler)? Env keys
  (public key, private key, url endpoint).
- Recommended SDK: `imagekitio-next` / `@imagekit/next` vs `imagekit` server SDK — which
  is current, and the minimal working upload snippet.
- Folder/naming strategy for invoice images.
- Offline: uploads need network. Confirm the pattern = hold the local image (blob/base64)
  in the offline queue, upload on reconnect, then patch `imageUrl`. Any ImageKit gotchas
  (retry, dedupe) for that deferred-upload flow.

## Answer

See `.wayfinder/research/02-imagekit-upload.md`. SDK `@imagekit/next` (legacy
`imagekitio-next` dead). Client-side upload (browser→ImageKit, blob stays local for
offline queue). Route handler generates auth via `getUploadAuthParams` from
`@imagekit/next/server` using `IMAGEKIT_PRIVATE_KEY`; env: `IMAGEKIT_PRIVATE_KEY`,
`IMAGEKIT_PUBLIC_KEY`, `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`. Offline: fetch **fresh** auth
right before upload (tokens ~1h TTL); dedupe via deterministic `fileName` (record UUID) +
`useUniqueFileName:false` + `overwriteFile:false` so retries of already-uploaded files
fail-as-success. Folder `/invoices/{YYYY}/{MM}/`.
