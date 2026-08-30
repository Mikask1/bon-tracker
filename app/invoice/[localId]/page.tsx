'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoginGate } from '@/components/LoginGate';
import { trpc } from '@/lib/trpc/client';
import { useAuthStore } from '@/store/authStore';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import { serverToRow, pendingToRow } from '@/hooks/useInvoiceRows';
import { ImageZoom } from '@/components/ImageZoom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InvoiceDetailSkeleton } from '@/components/Skeletons';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { ArrowLeft, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatRupiah, formatDate } from '@/lib/format';

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
  const router = useRouter();
  const isAdmin = useAuthStore((s) => s.role === 'admin');
  const pending = usePendingStore((s) => s.items[localId]);
  const removePending = usePendingStore((s) => s.remove);
  const utils = trpc.useUtils();
  const del = trpc.invoices.delete.useMutation();
  // Only hit the server when it isn't a local draft.
  const query = trpc.invoices.getByLocalId.useQuery(
    { localId },
    { enabled: !pending }
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    setDeleting(true);
    try {
      if (pending) {
        removePending(localId); // unsynced draft: just drop from the queue
      } else {
        await del.mutateAsync({ localId });
        await utils.invoices.list.invalidate();
      }
      toast.success('Bon dihapus');
      router.push('/');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus');
      setDeleting(false);
    }
  }

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
        <h1 className="text-lg font-bold">{inv?.invoiceId?.toUpperCase() ?? 'Detail Bon'}</h1>
        {inv && isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu"
            className="ml-auto"
            onClick={() => setMenuOpen(true)}
          >
            <MoreVertical />
          </Button>
        )}
      </header>

      {isLoading && !inv ? (
        <InvoiceDetailSkeleton />
      ) : !inv ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Bon tidak ditemukan.
        </p>
      ) : (
        <div className="flex flex-col gap-5 p-4">
          <div className="flex items-center gap-2">
            {inv.status === 'LUNAS' ? (
              <Badge className="bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-600">
                Lunas
              </Badge>
            ) : (
              <Badge variant="destructive" className="px-3 py-1 text-sm">
                Belum Lunas
              </Badge>
            )}
            {inv.deliveryStatus === 'DIKIRIM' ? (
              <Badge className="bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-700">
                Dikirim
              </Badge>
            ) : (
              <Badge className="bg-blue-300 px-3 py-1 text-sm text-blue-950 hover:bg-blue-300">
                Belum Dikirim
              </Badge>
            )}
            {inv.sync !== 'synced' && (
              <Badge variant="secondary">
                {inv.sync === 'error' ? 'Gagal sinkron' : 'Menunggu sinkron'}
              </Badge>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {formatDate(inv.invoiceCreatedAt)}
            </span>
          </div>

          <ImageZoom
            src={inv.imageUrl}
            alt="Foto bon"
            className="w-full rounded-lg border object-contain"
          />

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
              <span>Total</span>
              <span>{formatRupiah(inv.grandTotal)}</span>
            </div>
            {inv.status === 'BELUM_LUNAS' && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Sudah dibayar</span>
                  <span>{formatRupiah(inv.grandTotal - inv.unpaidAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-semibold text-destructive">
                  <span>Belum dibayar</span>
                  <span>{formatRupiah(inv.unpaidAmount)}</span>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{inv?.invoiceId?.toUpperCase() ?? 'Bon'}</DrawerTitle>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMenuOpen(false);
                router.push(`/invoice/${localId}/edit`);
              }}
            >
              <Pencil /> Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
            >
              <Trash2 /> Hapus
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Hapus bon ini?</DrawerTitle>
            <DrawerDescription>
              {inv?.invoiceId?.toUpperCase() ?? 'Bon'} akan dihapus permanen. Tidak bisa dibatalkan.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting ? 'Menghapus…' : 'Hapus'}
            </Button>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Batal
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
