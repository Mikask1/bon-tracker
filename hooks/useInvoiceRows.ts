'use client';

import {
  computeGrandTotal,
  type Buyer,
  type Item,
  type Status,
  type Invoice,
} from '@/types/invoice';
import type { PendingInvoice } from '@/store/pendingInvoiceStore';

export interface InvoiceRow {
  localId: string;
  invoiceId: string | null; // null while still a pending draft
  buyer: Buyer;
  items: Item[];
  grandTotal: number;
  status: Status;
  unpaidAmount: number;
  imageUrl: string;
  invoiceCreatedAt: Date;
  createdAt: Date;
  sync: 'synced' | 'pending' | 'error';
}

export function serverToRow(i: Invoice): InvoiceRow {
  return {
    localId: i.localId,
    invoiceId: i.invoiceId,
    buyer: i.buyer,
    items: i.items,
    grandTotal: i.grandTotal,
    status: i.status,
    unpaidAmount: i.unpaidAmount,
    imageUrl: i.imageUrl,
    invoiceCreatedAt: new Date(i.invoiceCreatedAt),
    createdAt: new Date(i.createdAt),
    sync: 'synced',
  };
}

export function pendingToRow(p: PendingInvoice): InvoiceRow {
  return {
    localId: p.input.localId,
    invoiceId: null,
    buyer: p.input.buyer,
    items: p.input.items,
    grandTotal: computeGrandTotal(p.input.items),
    status: p.input.status,
    unpaidAmount: p.input.unpaidAmount,
    imageUrl: p.input.imageUrl,
    invoiceCreatedAt: new Date(p.input.invoiceCreatedAt),
    createdAt: new Date(p.input.createdAt),
    sync: p.syncStatus,
  };
}

export interface DayGroup {
  key: string; // yyyy-mm-dd, local
  date: Date;
  rows: InvoiceRow[];
}

// Group rows under one heading per day, newest day first. Rows are sorted here
// rather than relying on the server order, because unsynced drafts are merged in
// client-side and would otherwise open a stray group above today's.
export function groupByDay(rows: InvoiceRow[]): DayGroup[] {
  const sorted = [...rows].sort(
    (a, b) => b.invoiceCreatedAt.getTime() - a.invoiceCreatedAt.getTime()
  );
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();

  for (const r of sorted) {
    const key = toYMD(r.invoiceCreatedAt);
    let g = byKey.get(key);
    if (!g) {
      g = { key, date: r.invoiceCreatedAt, rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}

// One-line summary of what was bought — the recognition cue that replaces the
// buyer's address and phone in the ledger row.
export function itemSummary(items: Item[]): string {
  if (items.length === 0) return '';
  const first = items[0].itemName;
  return items.length > 1 ? `${first}, +${items.length - 1} lain` : first;
}

// yyyy-mm-dd in local time (matches the date-range inputs).
export function toYMD(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// Client-side predicate for the small pending-draft overlay only.
// The bulk list is filtered server-side; this just keeps unsynced drafts
// consistent with the active filters.
export function matchesFilters(
  r: InvoiceRow,
  f: { q: string; status: 'ALL' | Status; from: string; to: string }
): boolean {
  if (f.status !== 'ALL' && r.status !== f.status) return false;
  const ymd = toYMD(r.createdAt);
  if (f.from && ymd < f.from) return false;
  if (f.to && ymd > f.to) return false;
  const tokens = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const hay = [
      r.invoiceId ?? 'draft',
      r.buyer.name,
      r.buyer.address,
      r.buyer.phoneNumber,
      ...r.items.map((i) => i.itemName),
      String(r.grandTotal),
    ]
      .join(' ')
      .toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) return false;
  }
  return true;
}
