'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { LoginGate } from '@/components/LoginGate';
import { InvoiceForm } from '@/components/InvoiceForm';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import { serverToRow, pendingToRow, thumbUrl } from '@/hooks/useInvoiceRows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Pencil } from 'lucide-react';
import { formatRupiah } from '@/lib/format';

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ localId: string }>;
}) {
  const { localId } = use(params);
  return (
    <LoginGate>
      <Detail localId={localId} />
    </LoginGate>
  );
}

function Detail({ localId }: { localId: string }) {
  const pending = usePendingStore((s) => s.items[localId]);
  // Only hit the server when it isn't a local draft.
  const query = trpc.invoices.getByLocalId.useQuery(
    { localId },
    { enabled: !pending }
  );

  const [editOpen, setEditOpen] = useState(false);

  const inv = pending
    ? pendingToRow(pending)
    : query.data
      ? serverToRow(query.data)
      : undefined;
  const isLoading = !pending && query.isLoading;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-2 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">{inv?.invoiceId ?? 'Detail Invoice'}</h1>
        {inv && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setEditOpen(true)}
          >
            <Pencil /> Edit
          </Button>
        )}
      </header>

      {isLoading && !inv ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !inv ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Invoice tidak ditemukan.
        </p>
      ) : (
        <div className="flex flex-col gap-5 p-4">
          <div className="flex items-center gap-2">
            {inv.status === 'LUNAS' ? (
              <Badge>Lunas</Badge>
            ) : (
              <Badge variant="destructive">Belum Lunas</Badge>
            )}
            {inv.sync !== 'synced' && (
              <Badge variant="secondary">
                {inv.sync === 'error' ? 'Gagal sinkron' : 'Menunggu sinkron'}
              </Badge>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {inv.createdAt.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>

          {inv.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl(inv.imageUrl, 800)}
              alt="Foto invoice"
              className="w-full rounded-lg border object-contain"
            />
          )}

          {/* Buyer */}
          <section>
            <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
              Pembeli
            </h2>
            {inv.buyer.name && <p className="font-medium">{inv.buyer.name}</p>}
            <p>{inv.buyer.address}</p>
            {inv.buyer.phoneNumber && (
              <p className="text-muted-foreground">{inv.buyer.phoneNumber}</p>
            )}
          </section>

          {/* Items */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              Barang
            </h2>
            <div className="flex flex-col divide-y rounded-lg border">
              {inv.items.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{it.itemName}</p>
                    <p className="text-sm text-muted-foreground">
                      {it.itemQty} × {formatRupiah(it.unitPrice)}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">
                    {formatRupiah(it.itemQty * it.unitPrice)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Totals */}
          <section className="flex flex-col gap-1 border-t pt-3">
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Grand Total</span>
              <span>{formatRupiah(inv.grandTotal)}</span>
            </div>
            {inv.status === 'BELUM_LUNAS' && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Sudah dibayar</span>
                  <span>{formatRupiah(inv.grandTotal - inv.unpaidAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-medium text-destructive">
                  <span>Belum dibayar</span>
                  <span>{formatRupiah(inv.unpaidAmount)}</span>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {inv && (
        <InvoiceForm open={editOpen} onOpenChange={setEditOpen} initial={inv} />
      )}
    </div>
  );
}
