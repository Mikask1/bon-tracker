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
    createdAt: new Date(p.input.createdAt),
    sync: p.syncStatus,
  };
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

// ImageKit URL transformation for a square thumbnail. Empty string when no image.
export function thumbUrl(url: string, size = 120): string {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}tr=w-${size},h-${size},fo-auto`;
}
