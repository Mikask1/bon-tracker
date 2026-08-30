'use client';

import { useEffect, useRef, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import {
  serverToRow,
  pendingToRow,
  matchesFilters,
  groupByDay,
  itemSummary,
  type InvoiceRow,
} from '@/hooks/useInvoiceRows';
import { InvoiceThumb } from '@/components/InvoiceThumb';
import { LongPressRow } from '@/components/LongPressRow';
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
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
import { formatRupiah, formatDayHeading, formatShortDate } from '@/lib/format';
import type { Status, DeliveryStatus, Invoice } from '@/types/invoice';

const PAGE_SIZE = 15;

// One end of the date range. The real <input type="date"> is kept — it opens the
// OS picker, which beats any in-page calendar on a phone — but sits invisible on
// top of a face we control, so an unset field can name itself instead of
// rendering the browser's dd/mm/yyyy. Empty still means no restriction; nothing
// is pre-filtered on open.
function DateField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex h-11 items-center justify-center rounded-md border px-2">
        <span className={`truncate ${value ? '' : 'text-muted-foreground'}`}>
          {value ? formatShortDate(value) : placeholder}
        </span>
      </div>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      {value && (
        <button
          type="button"
          aria-label={`Hapus ${label}`}
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

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
  // Row a long-press opened the quick-actions menu for.
  const [actionRow, setActionRow] = useState<InvoiceRow | null>(null);

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
  // Both statuses checked, or neither, both mean "no restriction" — only picking
  // exactly one actually narrows the list. Unlike a bon's own status (edited as an
  // either/or choice on the detail page), this filter can be both, one, or none.
  const [selectedStatuses, setSelectedStatuses] = useState<Status[]>([]);
  const [selectedDeliveries, setSelectedDeliveries] = useState<DeliveryStatus[]>(
    []
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const dq = useDebounced(q);

  const status: 'ALL' | Status =
    selectedStatuses.length === 1 ? selectedStatuses[0] : 'ALL';
  const delivery: 'ALL' | DeliveryStatus =
    selectedDeliveries.length === 1 ? selectedDeliveries[0] : 'ALL';
  const filtersActive =
    selectedStatuses.length === 1 ||
    selectedDeliveries.length === 1 ||
    !!from ||
    !!to;

  function toggleStatus(s: Status) {
    setSelectedStatuses((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
    );
    resetPage();
  }

  function toggleDelivery(d: DeliveryStatus) {
    setSelectedDeliveries((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]
    );
    resetPage();
  }

  const listQueryInput = {
    q: dq,
    status,
    delivery,
    dateFrom: from || undefined,
    dateTo: to || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const list = trpc.invoices.list.useQuery(listQueryInput, {
    placeholderData: keepPreviousData,
  });

  // Quick single-field toggles for the long-press menu — patch the cached
  // page instantly, then confirm against the server (or, for a still-local
  // draft, patch the offline queue directly since there's no doc yet).
  const setStatusMut = trpc.invoices.setStatus.useMutation();
  const setDeliveryMut = trpc.invoices.setDeliveryStatus.useMutation();
  const updatePendingInput = usePendingStore((s) => s.updateInput);

  function patchCachedRow(
    localId: string,
    patch: Partial<Pick<Invoice, 'status' | 'unpaidAmount' | 'deliveryStatus'>>
  ) {
    utils.invoices.list.setData(listQueryInput, (old) =>
      old
        ? {
            ...old,
            rows: old.rows.map((r) =>
              r.localId === localId ? { ...r, ...patch } : r
            ),
          }
        : old
    );
  }

  function toggleRowStatus(r: { localId: string; status: Status; grandTotal: number; sync: string }) {
    const next: Status = r.status === 'LUNAS' ? 'BELUM_LUNAS' : 'LUNAS';
    const unpaidAmount = next === 'BELUM_LUNAS' ? r.grandTotal : 0;
    if (r.sync !== 'synced') {
      updatePendingInput(r.localId, { status: next, unpaidAmount });
      return;
    }
    patchCachedRow(r.localId, { status: next, unpaidAmount });
    setStatusMut.mutate(
      { localId: r.localId, status: next },
      {
        onError: () => {
          toast.error('Gagal memperbarui status');
          utils.invoices.list.invalidate();
        },
        onSuccess: () => utils.invoices.list.invalidate(),
      }
    );
  }

  function toggleRowDelivery(r: { localId: string; deliveryStatus: DeliveryStatus; sync: string }) {
    const next: DeliveryStatus =
      r.deliveryStatus === 'DIKIRIM' ? 'BELUM_DIKIRIM' : 'DIKIRIM';
    if (r.sync !== 'synced') {
      updatePendingInput(r.localId, { deliveryStatus: next });
      return;
    }
    patchCachedRow(r.localId, { deliveryStatus: next });
    setDeliveryMut.mutate(
      { localId: r.localId, deliveryStatus: next },
      {
        onError: () => {
          toast.error('Gagal memperbarui status kirim');
          utils.invoices.list.invalidate();
        },
        onSuccess: () => utils.invoices.list.invalidate(),
      }
    );
  }

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
          .filter((r) => matchesFilters(r, { q: dq, status, delivery, from, to }))
      : [];

  // Active scan jobs (not yet saved as an invoice) — always shown on top.
  const savedIds = new Set([
    ...serverRows.map((r) => r.localId),
    ...Object.keys(pendingMap),
  ]);
  const jobRows = Object.values(jobsMap).filter((j) => !savedIds.has(j.localId));

  const rows = [...pendingRows, ...serverRows];
  const groups = groupByDay(rows);
  // keepPreviousData holds the old rows on screen while a new query runs, so
  // changing a filter looks like it did nothing. Fall back to the skeleton
  // whenever what's displayed no longer answers the active filters.
  const showSkeleton =
    list.isLoading || (list.isFetching && list.isPlaceholderData);
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
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-12 border-2 pl-10 text-base"
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
            className="relative size-12 shrink-0"
            onClick={() => setShowFilters((v) => !v)}
            aria-label="Filter"
          >
            <SlidersHorizontal className="size-5" />
            {filtersActive && (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
            )}
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-col gap-3 pt-1">
            {/* Independent toggles, not a single-choice picker: Lunas and Belum
                Lunas can both be on, both off, or just one — either way narrows
                to what's actually picked (both/neither = no restriction). */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                aria-pressed={selectedStatuses.includes('LUNAS')}
                onClick={() => toggleStatus('LUNAS')}
                className={
                  'h-11 flex-1 text-base font-semibold ' +
                  (selectedStatuses.includes('LUNAS')
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:text-white'
                    : '')
                }
              >
                Lunas
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={selectedStatuses.includes('BELUM_LUNAS')}
                onClick={() => toggleStatus('BELUM_LUNAS')}
                className={
                  'h-11 flex-1 text-base font-semibold ' +
                  (selectedStatuses.includes('BELUM_LUNAS')
                    ? 'border-destructive bg-destructive text-white hover:bg-destructive hover:text-white'
                    : '')
                }
              >
                Belum Lunas
              </Button>
            </div>

            {/* Same independent-toggle pattern as above, for delivery status. */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                aria-pressed={selectedDeliveries.includes('DIKIRIM')}
                onClick={() => toggleDelivery('DIKIRIM')}
                className={
                  'h-11 flex-1 text-base font-semibold ' +
                  (selectedDeliveries.includes('DIKIRIM')
                    ? 'border-yellow-200 bg-yellow-200 text-yellow-900 hover:bg-yellow-200 hover:text-yellow-900'
                    : '')
                }
              >
                Dikirim
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={selectedDeliveries.includes('BELUM_DIKIRIM')}
                onClick={() => toggleDelivery('BELUM_DIKIRIM')}
                className={
                  'h-11 flex-1 text-base font-semibold ' +
                  (selectedDeliveries.includes('BELUM_DIKIRIM')
                    ? 'border-gray-300 bg-gray-300 text-gray-700 hover:bg-gray-300 hover:text-gray-700'
                    : '')
                }
              >
                Belum Dikirim
              </Button>
            </div>

            {/* Unset reads as "TGL AWAL — TGL AKHIR": the no-filter state is named
                on screen instead of implied by two blank boxes. */}
            <div className="flex items-center gap-2">
              <DateField
                label="Tanggal awal"
                placeholder="TGL AWAL"
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  resetPage();
                }}
              />
              <span className="shrink-0 text-muted-foreground">—</span>
              <DateField
                label="Tanggal akhir"
                placeholder="TGL AKHIR"
                value={to}
                onChange={(v) => {
                  setTo(v);
                  resetPage();
                }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="flex flex-col pb-28">
        {/* active scan jobs — pinned above the ledger; they aren't bons yet, so they
            have no invoice date to file under a day heading. Local state, so they
            stay put while the server list reloads. */}
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

        {showSkeleton && <InvoiceListSkeleton />}

        {!showSkeleton && rows.length === 0 && jobRows.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {total === 0 &&
            !dq &&
            status === 'ALL' &&
            delivery === 'ALL' &&
            !from &&
            !to
              ? 'Belum ada bon. Tekan tombol + untuk menambah.'
              : 'Tidak ada bon yang cocok dengan filter.'}
          </p>
        )}

        {/* The ledger: one heading per day, entries ruled underneath it. The date is
            printed once per group instead of once per row. */}
        {!showSkeleton &&
          groups.map((g) => (
          <section key={g.key}>
            <h2 className="px-4 pb-1 pt-5 font-semibold">{formatDayHeading(g.date)}</h2>

            {g.rows.map((r) => {
              const paid = r.status === 'LUNAS';
              const delivered = r.deliveryStatus === 'DIKIRIM';
              const summary = itemSummary(r.items);
              return (
                <div key={r.localId} className="relative ml-4 border-t">
                  {/* Status spines. Length/position carry the state as well as hue
                      does, so it survives colour deficiency. */}
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 -left-4 w-1 ${
                      paid ? 'bg-blue-600' : 'bg-destructive'
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 -left-3 w-1 ${
                      delivered ? 'bg-yellow-400' : 'bg-gray-400'
                    }`}
                  />

                  {/* Tap opens the bon; long-press opens a quick-actions menu to
                      toggle lunas/belum lunas or dikirim/belum dikirim. */}
                  <LongPressRow
                    className="flex items-center gap-3 py-3 pl-3 pr-4 active:bg-muted/50"
                    onTap={() => router.push(`/invoice/${r.localId}`)}
                    onLongPress={() => setActionRow(r)}
                  >
                    {/* Small square of the nota itself — the strongest recognition cue
                        for a bon the owner was present for. Requested at 2× so it stays
                        sharp on a retina screen. */}
                    <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      <InvoiceThumb src={r.imageUrl} size={80} />
                    </div>

                    <div className="min-w-0 flex-1">
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

                    {/* Whether it is paid and how much is still owed, plus whether
                        it's been delivered — nothing else. The grand total isn't the
                        question a bon list answers, so it stays on the detail page. */}
                    <div className="flex min-w-24 shrink-0 flex-col items-end gap-0.5 text-right">
                      {paid ? (
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          Lunas
                        </span>
                      ) : (
                        <span className="font-semibold tabular-nums text-destructive">
                          Sisa {formatRupiah(r.unpaidAmount)}
                        </span>
                      )}
                      <span
                        className={`font-semibold ${
                          delivered
                            ? 'text-yellow-700 dark:text-yellow-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {delivered ? 'Dikirim' : 'Belum Dikirim'}
                      </span>
                    </div>
                  </LongPressRow>
                </div>
              );
            })}
          </section>
        ))}

        {total > 0 && !showSkeleton && (
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

      {/* Bottom bar: the primary action, with settings parked to its left. Settings
          is icon-only and unlabelled next to a wide labelled button, so the two
          never compete — and it keeps the header down to search and filter. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <SettingsButton />
          <Button
            size="lg"
            onClick={() => setChooser(true)}
            className="h-14 flex-1 text-base font-bold"
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

      {/* Long-press quick actions: two one-tap toggles, each labeled with the
          state it will switch to. Auto-dismisses after either is tapped. */}
      <Drawer open={!!actionRow} onOpenChange={(v) => !v && setActionRow(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{actionRow?.buyer.name || 'Bon'}</DrawerTitle>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              variant="outline"
              className={
                'h-12 ' +
                (actionRow?.status === 'LUNAS'
                  ? 'border-destructive bg-destructive text-white hover:bg-destructive hover:text-white'
                  : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:text-white')
              }
              onClick={() => {
                if (actionRow) toggleRowStatus(actionRow);
                setActionRow(null);
              }}
            >
              {actionRow?.status === 'LUNAS' ? 'Tandai Belum Lunas' : 'Tandai Lunas'}
            </Button>
            <Button
              variant="outline"
              className={
                'h-12 ' +
                (actionRow?.deliveryStatus === 'DIKIRIM'
                  ? 'border-gray-300 bg-gray-300 text-gray-700 hover:bg-gray-300 hover:text-gray-700'
                  : 'border-yellow-200 bg-yellow-200 text-yellow-900 hover:bg-yellow-200 hover:text-yellow-900')
              }
              onClick={() => {
                if (actionRow) toggleRowDelivery(actionRow);
                setActionRow(null);
              }}
            >
              {actionRow?.deliveryStatus === 'DIKIRIM' ? 'Tandai Belum Dikirim' : 'Tandai Dikirim'}
            </Button>
            <Button variant="outline" className="h-12" onClick={() => setActionRow(null)}>
              Batal
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
