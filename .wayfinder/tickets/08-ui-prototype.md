---
id: 08
title: "Prototype: Mobile-first list + FAB + capture/form UX"
type: prototype
status: closed
assignee: Mikask
blocked_by: [04]
blocks: []
---

## Question

Make a cheap, concrete mobile-first mockup to react to. Covers the whole surface (it's a
small app).

Prototype:
- **List (home):** mobile rows/cards. Column "Pembeli" stacks name / address / phoneNumber;
  "Grand Total"; status badge (Lunas / Belum Lunas); invoice ID. Belum Lunas shows unpaid
  amount. Sync-pending indicator (from 07).
- **FAB:** single bottom `+` → capture flow (camera / upload).
- **Form:** prefilled from Gemini (buyer + items table: itemName / qty / unitPrice, add/
  remove rows), live grand total, image preview. Status toggle → Belum Lunas reveals the
  unpaid-amount field (07/04 rules).
- Thumb-reach, one-hand use. shadcn/ui components (mirror FitTrack: drawer vs dialog for
  form?).

Consult `prototype` + `grilling`. Link the artifact here. Depends on data model (04).

## Answer

Skipped as a standalone throwaway (user call) — UI settled **live during the build slice**
by reacting to the real thing. Surface + rules already fixed by 04/05/07 (columns: Pembeli
[name/address/phone stacked], Grand Total, status badge, invoice ID / temp label + sync
badge; single `+` FAB; form with items table + live total + status→unpaid reveal). Build it
in the form/list slice.

## Answer (original)
