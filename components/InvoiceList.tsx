'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import {
  serverToRow,
  pendingToRow,
  matchesFilters,
  groupByDay,
  itemSummary,
} from '@/hooks/useInvoiceRows';
import { InvoiceThumb } from '@/components/InvoiceThumb';
import { SettingsButton } from './FontScale';
import { useScanJobStore } from '@/store/scanJobStore';
import { uploadImage } from '@/lib/upload';
import { prepareScanImage, type ScanImage } from '@/lib/compressImage';
import { sha256 } from '@/lib/hash';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { InvoiceListSkeleton } from '@/components/Skeletons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Plus,
  Search,
  SlidersHorizontal,
  Camera,
  Upload,
  PencilLine,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatRupiah, formatDayHeading } from '@/lib/format';
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
  const [chooser, setChooser] = useState(false);
  const [cancelJobId, setCancelJobId] = useState<string | undefined>(undefined);
  const [dup, setDup] = useState<
    { file: File; hash: string; localId: string; invoiceId: string } | null
  >(null);

  const addJob = useScanJobStore((s) => s.add);
  const updateJob = useScanJobStore((s) => s.update);
  const removeJob = useScanJobStore((s) => s.remove);
  const jobsMap = useScanJobStore((s) => s.jobs);
  const scan = trpc.invoices.scan.useMutation();
  const utils = trpc.useUtils();
  const router = useRouter();
  const runningRef = useRef<Set<string>>(new Set());

  // Scan runs detached from the form page (InvoiceList stays mounted). `image` is
  // the original photo's bytes, passed straight through for full-quality OCR; it
  // is deliberately never persisted, so a job still carries only its URL and a
  // resumed scan after a reload falls back to the stored (compressed) image.
  async function runScan(localId: string, imageUrl: string, image?: ScanImage) {
    if (runningRef.current.has(localId)) return;
    runningRef.current.add(localId);
    try {
      const data = await scan.mutateAsync({ imageUrl, image: image ?? undefined });
      updateJob(localId, { status: 'done', extracted: data });
    } catch (e) {
      updateJob(localId, {
        status: 'error',
        error: e instanceof Error ? e.message : 'Gagal memindai',
      });
      toast.error('Pemindaian gagal — buka untuk isi manual');
    } finally {
      runningRef.current.delete(localId);
    }
  }

  // Hash the bytes first: if this exact photo is already a saved invoice, ask before
  // uploading — the user can view the existing bon or create a new one anyway.
  async function startFoto(file: File) {
    setChooser(false);
    const hash = await sha256(file);
    try {
      const found = await utils.invoices.findByImageHash.fetch({ hash });
      if (found) {
        setDup({ file, hash, ...found });
        return;
      }
    } catch {
      // offline / lookup failed — fall through and upload as normal
    }
    doUpload(file, hash);
  }

  // Upload the (compressed) photo, then create the tiny URL-only job and scan it
  // — the scan gets the original bytes, which only exist here in memory.
  async function doUpload(file: File, hash: string) {
    const toastId = toast.loading('Mengunggah…');
    try {
      const [url, scanImage] = await Promise.all([
        uploadImage(file),
        prepareScanImage(file),
      ]);
      const localId = crypto.randomUUID();
      addJob({
        localId,
        status: 'scanning',
        imageUrl: url,
        imageHash: hash,
        createdAt: new Date().toISOString(),
      });
      runScan(localId, url, scanImage ?? undefined);
      toast.dismiss(toastId);
      router.push(`/invoice/new/${localId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload gagal', { id: toastId });
    }
  }

  // Resume any 'scanning' jobs left over from a previous session (reload mid-scan).
  useEffect(() => {
    for (const j of Object.values(useScanJobStore.getState().jobs)) {
      if (j.status === 'scanning' && j.imageUrl) runScan(j.localId, j.imageUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | Status>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const dq = useDebounced(q);

  const filtersActive = status !== 'ALL' || !!from || !!to;

  const list = trpc.invoices.list.useQuery(
    {
      q: dq,
      status,
      dateFrom: from || undefined,
      dateTo: to || undefined,
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

  // Active scan jobs (not yet saved as an invoice) — always shown on top.
  const savedIds = new Set([
    ...serverRows.map((r) => r.localId),
    ...Object.keys(pendingMap),
  ]);
  const jobRows = Object.values(jobsMap).filter((j) => !savedIds.has(j.localId));

  const rows = [...pendingRows, ...serverRows];
  const groups = groupByDay(rows);
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="icon"
            className="relative shrink-0"
            onClick={() => setShowFilters((v) => !v)}
            aria-label="Filter"
          >
            <SlidersHorizontal />
            {filtersActive && (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-background" />
            )}
          </Button>
          <SettingsButton />
        </div>

        {showFilters && (
          <div className="flex flex-col gap-2 pt-1">
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
          </div>
        )}
      </header>

      <div className="flex flex-col pb-28">
        {list.isLoading && <InvoiceListSkeleton />}

        {/* active scan jobs — pinned above the ledger; they aren't bons yet, so they
            have no invoice date to file under a day heading */}
        {jobRows.map((j) => (
          <div key={j.localId} className="flex items-center gap-3 border-b p-4">
            <button
              onClick={() => router.push(`/invoice/new/${j.localId}`)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                <InvoiceThumb src={j.imageUrl} size={112} />
              </div>
              <div className="min-w-0 flex-1">
                {j.status === 'scanning' && (
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="size-4 animate-spin" /> Memindai…
                  </span>
                )}
                {j.status === 'done' && (
                  <Badge className="text-[0.625rem]">Perlu dilengkapi</Badge>
                )}
                {j.status === 'error' && (
                  <Badge variant="destructive" className="text-[0.625rem]">
                    Gagal pindai
                  </Badge>
                )}
                <p className="truncate text-sm text-muted-foreground">
                  {j.status === 'scanning'
                    ? 'Foto sedang diproses'
                    : j.status === 'done'
                      ? j.extracted?.buyer.name || 'Ketuk untuk lengkapi'
                      : 'Ketuk untuk isi manual'}
                </p>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              aria-label="Batalkan pemindaian"
              onClick={() => setCancelJobId(j.localId)}
            >
              <X />
            </Button>
          </div>
        ))}

        {!list.isLoading && rows.length === 0 && jobRows.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {total === 0 && !dq && status === 'ALL' && !from && !to
              ? 'Belum ada bon. Tekan tombol + untuk menambah.'
              : 'Tidak ada bon yang cocok dengan filter.'}
          </p>
        )}

        {/* The ledger: one heading per day, entries ruled underneath it. The date is
            printed once per group instead of once per row, and the amounts sit in
            their own right-aligned column so they can be compared down the page. */}
        {groups.map((g) => (
          <section key={g.key}>
            <div className="flex items-start justify-between gap-2 px-4 pb-1 pt-5">
              <h2 className="font-semibold">{formatDayHeading(g.date)}</h2>
              <div className="shrink-0 pt-0.5 text-right">
                <p className="text-xs text-muted-foreground">{g.rows.length} bon</p>
                <p
                  className={`text-xs font-semibold tabular-nums ${
                    g.outstanding > 0 ? 'text-destructive' : 'text-blue-700 dark:text-blue-400'
                  }`}
                >
                  {g.outstanding > 0 ? `sisa ${formatRupiah(g.outstanding)}` : 'lunas semua'}
                </p>
              </div>
            </div>

            {g.rows.map((r) => {
              const paid = r.status === 'LUNAS';
              const summary = itemSummary(r.items);
              return (
                <Link
                  key={r.localId}
                  href={`/invoice/${r.localId}`}
                  className="relative ml-4 flex items-center gap-3 border-t py-3 pr-4 active:bg-muted/50"
                >
                  {/* Status spine. Length and position carry the state as well as
                      hue does, so it survives colour deficiency. */}
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 -left-4 w-1 ${
                      paid ? 'bg-blue-600' : 'bg-destructive'
                    }`}
                  />

                  <div className="min-w-0 flex-1 pl-3">
                    <p className="truncate font-medium">{r.buyer.name || '—'}</p>
                    {summary && (
                      <p className="truncate text-sm text-muted-foreground">
                        {summary}
                      </p>
                    )}
                    {r.sync === 'pending' && (
                      <Badge variant="secondary" className="mt-1">
                        Menunggu sinkron
                      </Badge>
                    )}
                    {r.sync === 'error' && (
                      <Badge variant="destructive" className="mt-1">
                        Gagal sinkron
                      </Badge>
                    )}
                  </div>

                  {/* Whether it is paid, and how much is still owed — nothing else.
                      The grand total isn't the question a bon list answers, so it
                      doesn't appear here at all (it's still on the detail page). */}
                  <div className="min-w-24 shrink-0 border-l pl-3 text-right">
                    {paid ? (
                      <span className="font-semibold text-blue-700 dark:text-blue-400">
                        Lunas
                      </span>
                    ) : (
                      <span className="font-semibold tabular-nums text-destructive">
                        Sisa {formatRupiah(r.unpaidAmount)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </section>
        ))}

        {total > 0 && (
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <span className="text-muted-foreground">
              {start}–{end} dari {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Sebelumnya"
                disabled={page <= 1 || list.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Berikutnya"
                disabled={page >= totalPages || list.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar: one full-width, labelled primary action. Settings moved up to
          the header, so nothing else competes with it down here. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button
            size="lg"
            onClick={() => setChooser(true)}
            className="h-14 w-full text-base font-bold"
          >
            <Plus className="size-5" /> Bon Baru
          </Button>
        </div>
      </nav>

      {/* Bon Baru chooser: Kamera, Unggah foto, or Manual */}
      <Drawer open={chooser} onOpenChange={setChooser}>
        <DrawerContent>
          <DrawerHeader className="text-center">
            <DrawerTitle>Bon Baru</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4 pb-8">
            {/* capture=camera forces the camera; the other input has no capture so
                it opens the gallery / file picker (and Take Photo on iOS). */}
            <label className="w-full">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) startFoto(f);
                }}
              />
              <Button asChild size="lg" className="h-14 w-full text-base">
                <span>
                  <Camera className="size-5" /> Kamera
                </span>
              </Button>
            </label>

            <label className="w-full">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) startFoto(f);
                }}
              />
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="h-14 w-full text-base"
              >
                <span>
                  <Upload className="size-5" /> Unggah Foto
                </span>
              </Button>
            </label>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              atau
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              size="lg"
              className="h-14 w-full text-base"
              onClick={() => {
                setChooser(false);
                router.push('/invoice/new');
              }}
            >
              <PencilLine className="size-5" /> Manual
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* duplicate photo — already saved as an invoice */}
      <Drawer open={!!dup} onOpenChange={(v) => !v && setDup(null)}>
        <DrawerContent>
          <DrawerHeader className="text-center">
            <DrawerTitle>Foto ini sudah ada</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4 pb-8">
            <Button
              size="lg"
              className="h-14 w-full text-base"
              onClick={() => {
                if (dup) router.push(`/invoice/${dup.localId}`);
                setDup(null);
              }}
            >
              Lihat {dup?.invoiceId?.toUpperCase()}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 w-full text-base"
              onClick={() => {
                if (dup) doUpload(dup.file, dup.hash);
                setDup(null);
              }}
            >
              Buat baru
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* cancel-job confirmation */}
      <Drawer
        open={!!cancelJobId}
        onOpenChange={(v) => {
          if (!v) setCancelJobId(undefined);
        }}
      >
        <DrawerContent>
          <DrawerHeader className="text-center">
            <DrawerTitle>Batalkan pemindaian?</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4 pb-8">
            <p className="text-center text-sm text-muted-foreground">
              Data pindaian ini akan dihapus dan tidak bisa dikembalikan.
            </p>
            <Button
              variant="destructive"
              className="h-12"
              onClick={() => {
                if (cancelJobId) removeJob(cancelJobId);
                setCancelJobId(undefined);
              }}
            >
              Ya, batalkan
            </Button>
            <Button
              variant="outline"
              className="h-12"
              onClick={() => setCancelJobId(undefined)}
            >
              Tidak
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
