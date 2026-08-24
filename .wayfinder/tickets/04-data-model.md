---
id: 04
title: "Decide: Invoice data model (mongoose + zod + sync fields)"
type: grilling
status: resolved
assignee: Mikask
blocked_by: []
blocks: [05, 07, 08]
---

## Question

Nail the Invoice domain model — the mongoose schema, the zod validator, and the
offline-sync bookkeeping fields.

Decide:
- Core shape: `buyer { name, address, phoneNumber }`, `items: [{ itemName, itemQty,
  unitPrice }]`, `imageUrl`, `status`, `unpaidAmount`, `invoiceId`, timestamps.
- `status` enum: `LUNAS` | `BELUM_LUNAS`. `unpaidAmount` required + `> 0` only when
  `BELUM_LUNAS`; forbidden/zero when `LUNAS` (zod refine).
- **Grand Total**: stored or computed from `sum(qty * unitPrice)`? Does `unpaidAmount`
  relate to grand total (partial payment ≤ total)?
- Money representation: integer rupiah (no decimals) vs float. Qty integer?
- Offline-sync fields: local id, `syncStatus` (pending/synced), `imagePending` flag,
  createdAt for ordering. What the client generates vs the server.
- Phone/address optional? Which buyer fields required for a valid save.

Consult `domain-modeling`.

## Answer

Final model (mongoose doc + zod validator, integer IDR).

```ts
Item = {
  itemName:  string   // required
  itemQty:   number   // > 0, decimals allowed (e.g. 1.5 kg)
  unitPrice: number   // integer rupiah, >= 0
}

Buyer = {
  name?:        string   // OPTIONAL
  address:      string   // REQUIRED (the one required buyer field)
  phoneNumber?: string   // OPTIONAL
}

Invoice = {
  invoiceId:    string                      // "YYMMDD-<hex>" — format ticket 05
  buyer:        Buyer
  items:        Item[]                       // >= 1
  grandTotal:   number                       // STORED, integer IDR = round(Σ itemQty*unitPrice)
  status:       'LUNAS' | 'BELUM_LUNAS'
  unpaidAmount: number                       // see rule below
  imageUrl:     string                       // ImageKit URL; '' while imagePending
  // offline-sync bookkeeping
  localId:      string                       // client uuid — stable key across sync (ticket 07)
  syncStatus:   'pending' | 'synced'
  imagePending: boolean                      // true until local blob uploaded to ImageKit
  createdAt, updatedAt
}
```

**Rules (zod refine, enforced server-side — never trust client totals):**
- `grandTotal` recomputed on every save from items: `round(Σ itemQty * unitPrice)`. Stored
  denormalized (fast list sort/display), so recompute is mandatory on create + edit.
- `BELUM_LUNAS` → `0 < unpaidAmount <= grandTotal`; UI **defaults** `unpaidAmount = grandTotal`
  (nothing paid yet), user edits down. Amount paid = `grandTotal - unpaidAmount` (derived, not stored).
- `LUNAS` → `unpaidAmount = 0`.
- Valid save needs: `buyer.address`, `items.length >= 1`, each item has `itemName` + `itemQty > 0`.

Money = integer rupiah (no cents). `itemQty` decimal → `qty*price` rounded to whole rupiah
at the `grandTotal` level.
