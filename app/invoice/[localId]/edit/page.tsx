'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { LoginGate } from '@/components/LoginGate';
import { InvoiceForm } from '@/components/InvoiceForm';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import { serverToRow, pendingToRow } from '@/hooks/useInvoiceRows';
import { InvoiceDetailSkeleton } from '@/components/Skeletons';

export default function EditInvoicePage({
  params,
}: {
  params: Promise<{ localId: string }>;
}) {
  const { localId } = use(params);
  return (
    <LoginGate>
      <Edit localId={localId} />
    </LoginGate>
  );
}

function Edit({ localId }: { localId: string }) {
  const router = useRouter();
  const pending = usePendingStore((s) => s.items[localId]);
  // Only hit the server when it isn't a local draft.
  const query = trpc.invoices.getByLocalId.useQuery(
    { localId },
    { enabled: !pending }
  );

  const inv = pending
    ? pendingToRow(pending)
    : query.data
      ? serverToRow(query.data)
      : undefined;
  const isLoading = !pending && query.isLoading;

  if (isLoading && !inv) return <InvoiceDetailSkeleton />;
  if (!inv) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Bon tidak ditemukan.
      </p>
    );
  }

  return (
    <InvoiceForm initial={inv} onDone={() => router.push(`/invoice/${localId}`)} />
  );
}
