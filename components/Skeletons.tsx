import { Skeleton } from '@/components/ui/skeleton';

// Placeholder for one ledger entry — mirrors the real entry in InvoiceList
// (status spine + buyer/items text + right-aligned amount column).
function InvoiceRowSkeleton() {
  return (
    <div className="relative ml-4 flex items-center gap-3 border-t py-3 pr-4">
      <span className="absolute inset-y-0 -left-4 w-1 bg-muted" />
      <div className="min-w-0 flex-1 space-y-2 pl-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="flex min-w-28 shrink-0 flex-col items-end gap-2 border-l pl-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

// List loading state — day headings with entries under them, so the skeleton
// has the same silhouette as the ledger it is standing in for.
export function InvoiceListSkeleton({
  days = 2,
  perDay = 3,
}: {
  days?: number;
  perDay?: number;
}) {
  return (
    <>
      {Array.from({ length: days }, (_, d) => (
        <section key={d}>
          <div className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          {Array.from({ length: perDay }, (_, i) => (
            <InvoiceRowSkeleton key={i} />
          ))}
        </section>
      ))}
    </>
  );
}

// Detail loading state — mirrors the bon detail body (status/date, photo,
// Pembeli, Barang table, totals).
export function InvoiceDetailSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="ml-auto h-4 w-28" />
      </div>

      <Skeleton className="aspect-[4/3] w-full rounded-lg" />

      <section className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </section>

      <section className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <div className="flex flex-col divide-y rounded-lg border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-between border-t pt-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-24" />
      </section>
    </div>
  );
}
