import { Skeleton } from '@/components/ui/skeleton';

// Placeholder for one invoice row — mirrors the real row in InvoiceList
// (56px thumbnail + stacked buyer text + right-aligned amount/badge).
function InvoiceRowSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4">
      <Skeleton className="size-14 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

// List loading state — rows inherit the list container's divide-y separators.
export function InvoiceListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <InvoiceRowSkeleton key={i} />
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
