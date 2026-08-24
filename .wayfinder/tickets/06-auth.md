---
id: 06
title: "Decide: Single-password auth + offline session"
type: grilling
status: resolved
assignee: Mikask
blocked_by: []
blocks: []
---

## Question

One shared account, single password gate. Decide the minimal mechanism that still works
offline-first.

Decide:
- Where the password lives: env var (hashed) checked server-side, vs a client-only gate.
  Prefer server check → issue session.
- Session mechanism: mirror FitTrack's JWT httpOnly cookie, or something lighter? What's
  the smallest thing that protects the tRPC procedures.
- Route protection: middleware vs per-procedure check in tRPC context.
- **Offline**: once logged in, the app must keep working offline (cached session).
  How long is the session valid; does an expired token block cached reads?
- Registration: none (single account) — confirm we drop User model / bcrypt registration
  flow from the FitTrack mirror, or keep a single seeded user.

## Answer

Single shared account. Mirror FitTrack's JWT util, drop registration.

- **Password**: one env var `APP_PASSWORD`, compared server-side on login (single shared
  secret — the env var *is* the secret; no user table, no bcrypt registration flow).
  `ponytail:` plaintext env compare; add hashing only if the env store becomes untrusted.
- **Session**: sign a JWT with `JWT_SECRET`, set as **httpOnly cookie, 30-day expiry**
  (long so offline use never locks out mid-day). Reuse FitTrack's `lib/utils/jwt.ts`.
- **Protection**: check the cookie in the tRPC context → `protectedProcedure` (mirror
  FitTrack). No separate middleware needed.
- **Offline**: first login needs network (server verifies password + issues cookie). After
  that the httpOnly cookie + TanStack-persisted cache serve the app offline for the 30-day
  window; token only re-checked server-side on the next online request.
- **Dropped from the FitTrack mirror**: `User` model, registration, bcrypt user hashing,
  multi-user context. Keep only the JWT sign/verify utils.

No blockers.
