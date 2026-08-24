'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import {
  serverToRow,
  pendingToRow,
  matchesFilters,
  thumbUrl,
} from '@/hooks/useInvoiceRows';
import { InvoiceForm } from './InvoiceForm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, ArrowDownUp, ImageIcon } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import type { Status } from '@/types/invoice';

const PAGE_SIZE = 15;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function InvoiceList() {
  const [open, setOpen] = useState(false);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | Status>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const list = trpc.invoices.list.useQuery(
    {
      q: dq,
      status,
      dateFrom: from || undefined,
      dateTo: to || undefined,
      sort: desc ? 'desc' : 'asc',
      page,
      limit: PAGE_SIZE,
    },
    { placeholderData: keepPreviousData }
  );

  const pendingMap = usePendingStore((s) => s.items);

  const serverRows = (list.data?.rows ?? []).map(serverToRow);
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Unsynced drafts live only on the client — overlay them on page 1, filtered
  // by the same controls so they don't ignore an active search/filter.
  const serverLocalIds = new Set(serverRows.map((r) => r.localId));
  const pendingRows =
    page === 1
      ? Object.values(pendingMap)
          .filter((p) => !serverLocalIds.has(p.input.localId))
          .map(pendingToRow)
          .filter((r) => matchesFilters(r, { q: dq, status, from, to }))
      : [];

  const rows = [...pendingRows, ...serverRows];
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-4 py-3">
        <h1 className="text-lg font-bold">Invoice</h1>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cari pembeli, alamat, barang, ID…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
          />
        </div>

        <div className="flex gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as 'ALL' | Status);
              resetPage();
            }}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua status</SelectItem>
              <SelectItem value="LUNAS">Lunas</SelectItem>
              <SelectItem value="BELUM_LUNAS">Belum Lunas</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setDesc((d) => !d);
              resetPage();
            }}
            aria-label="Urutkan tanggal"
            title={desc ? 'Terbaru dulu' : 'Terlama dulu'}
          >
            <ArrowDownUp className={desc ? '' : 'rotate-180'} />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Input
            type="date"
            className="flex-1"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPage();
            }}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            className="flex-1"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPage();
            }}
          />
        </div>
      </header>

      <div className="flex flex-col divide-y pb-28">
        {list.isLoading && (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!list.isLoading && rows.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {total === 0 && !dq && status === 'ALL' && !from && !to
              ? 'Belum ada invoice. Tekan tombol + untuk menambah.'
              : 'Tidak ada invoice yang cocok dengan filter.'}
          </p>
        )}

        {rows.map((r) => (
          <Link
            key={r.localId}
            href={`/invoice/${r.localId}`}
            className="flex items-start gap-3 p-4 active:bg-muted/50"
          >
            <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
              {r.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl(r.imageUrl, 112)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-5" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {r.invoiceId ?? 'Draft'}
                </span>
                {r.sync === 'pending' && (
                  <Badge variant="secondary" className="text-[10px]">
                    Menunggu sinkron
                  </Badge>
                )}
                {r.sync === 'error' && (
                  <Badge variant="destructive" className="text-[10px]">
                    Gagal sinkron
                  </Badge>
                )}
              </div>
              <p className="truncate font-medium">{r.buyer.name || '—'}</p>
              <p className="truncate text-sm text-muted-foreground">
                {r.buyer.address}
              </p>
              {r.buyer.phoneNumber && (
                <p className="truncate text-sm text-muted-foreground">
                  {r.buyer.phoneNumber}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold">{formatRupiah(r.grandTotal)}</span>
              {r.status === 'LUNAS' ? (
                <Badge>Lunas</Badge>
              ) : (
                <div className="flex flex-col items-end">
                  <Badge variant="destructive">Belum Lunas</Badge>
                  <span className="text-xs text-muted-foreground">
                    Sisa {formatRupiah(r.unpaidAmount)}
                  </span>
                </div>
              )}
            </div>
          </Link>
        ))}

        {total > 0 && (
          <div className="flex items-center justify-between p-4 text-sm">
            <span className="text-muted-foreground">
              {start}–{end} dari {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || list.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || list.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </div>

      <Button
        size="icon"
        className="fixed bottom-6 left-1/2 h-14 w-14 -translate-x-1/2 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Tambah invoice"
      >
        <Plus className="size-6" />
      </Button>

      <InvoiceForm open={open} onOpenChange={setOpen} />
    </div>
  );
}
