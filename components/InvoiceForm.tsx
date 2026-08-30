'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Image } from '@imagekit/next';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import { useScanJobStore } from '@/store/scanJobStore';
import { toYMD, type InvoiceRow } from '@/hooks/useInvoiceRows';
import { ImageZoom } from '@/components/ImageZoom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react';
import {
  computeGrandTotal,
  invoiceInputSchema,
  type Status,
  type DeliveryStatus,
} from '@/types/invoice';
import { formatRupiah } from '@/lib/format';

interface Row {
  itemName: string;
  itemQty: string;
  unitPrice: string;
}

const emptyRow = (): Row => ({ itemName: '', itemQty: '1', unitPrice: '' });

function parseRows(rows: Row[]) {
  return rows
    .filter((r) => r.itemName.trim() !== '')
    .map((r) => ({
      itemName: r.itemName.trim(),
      itemQty: Number(r.itemQty) || 0,
      unitPrice: Math.round(Number(r.unitPrice) || 0),
    }));
}

export function InvoiceForm({
  initial,
  jobId,
  uploading,
  onDone,
}: {
  initial?: InvoiceRow; // edit an existing invoice
  jobId?: string; // review a background scan job
  uploading?: boolean; // photo is uploading, before the job exists
  onDone: () => void; // back button, or after a successful save
}) {
  const isEdit = !!initial;
  const router = useRouter();
  const enqueue = usePendingStore((s) => s.enqueue);
  const removeJob = useScanJobStore((s) => s.remove);
  const job = useScanJobStore((s) => (jobId ? s.jobs[jobId] : undefined));
  const utils = trpc.useUtils();
  const update = trpc.invoices.update.useMutation();

  const busy = uploading || job?.status === 'scanning';

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [status, setStatus] = useState<Status>('BELUM_LUNAS');
  const [unpaid, setUnpaid] = useState('');
  const [deliveryStatus, setDeliveryStatus] =
    useState<DeliveryStatus>('BELUM_DIKIRIM');
  const [invDate, setInvDate] = useState(''); // yyyy-mm-dd; date printed on the nota
  const [imageUrl, setImageUrl] = useState('');
  // Nota total to reconcile summed items against (create only). Seeded from the scan,
  // but editable so a misread total can be corrected. Empty = no check. Never persisted.
  const [totalStr, setTotalStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const populatedRef = useRef(false);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  function loadBlank() {
    setName('');
    setAddress('');
    setPhone('');
    setRows([emptyRow()]);
    setStatus('BELUM_LUNAS');
    setUnpaid('');
    setDeliveryStatus('BELUM_DIKIRIM');
    setImageUrl('');
    setTotalStr('');
    setInvDate(toYMD(new Date()));
  }

  // Populate once on mount: from the invoice (edit), the finished scan (done), or blank.
  useEffect(() => {
    if (populatedRef.current) return;
    // Wait until the photo settles — don't populate (or mark populated) while the
    // upload/scan is still running, or the extracted data would never fill the form.
    if (uploading || job?.status === 'scanning') return;

    if (initial) {
      setName(initial.buyer.name);
      setAddress(initial.buyer.address);
      setPhone(initial.buyer.phoneNumber);
      setRows(
        initial.items.length
          ? initial.items.map((i) => ({
              itemName: i.itemName,
              itemQty: String(i.itemQty),
              unitPrice: String(i.unitPrice),
            }))
          : [emptyRow()]
      );
      setStatus(initial.status);
      setUnpaid(initial.status === 'BELUM_LUNAS' ? String(initial.unpaidAmount) : '');
      setDeliveryStatus(initial.deliveryStatus);
      setImageUrl(initial.imageUrl);
      setTotalStr(''); // editing a saved invoice: no reconciliation field
      setInvDate(toYMD(new Date(initial.invoiceCreatedAt)));
      populatedRef.current = true;
      return;
    }

    if (job) {
      if (job.status === 'done' && job.extracted) {
        const e = job.extracted;
        setName(e.buyer.name || '');
        setAddress(e.buyer.address || '');
        setPhone(e.buyer.phoneNumber || '');
        setRows(
          e.items.length
            ? e.items.map((i) => ({
                itemName: i.itemName || '',
                itemQty: String(i.itemQty || 1),
                unitPrice: String(Math.round(i.unitPrice || 0)),
              }))
            : [emptyRow()]
        );
        // Default to Belum Lunas unless the nota shows a LUNAS stamp.
        const paid = e.fullyPaid === true;
        setStatus(paid ? 'LUNAS' : 'BELUM_LUNAS');
        setUnpaid(paid ? '' : String(computeGrandTotal(e.items)));
        setImageUrl(job.imageUrl);
        setTotalStr(
          typeof e.grandTotal === 'number' && e.grandTotal > 0
            ? String(Math.round(e.grandTotal))
            : ''
        );
        setInvDate(
          e.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(e.invoiceDate)
            ? e.invoiceDate
            : toYMD(new Date())
        );
        populatedRef.current = true;
      } else if (job.status === 'error') {
        loadBlank();
        setImageUrl(job.imageUrl);
        populatedRef.current = true;
      }
      // scanning: wait — fields stay hidden until done
      return;
    }

    loadBlank();
    populatedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, uploading]);

  const grandTotal = computeGrandTotal(parseRows(rows));
  // Reconcile summed items against the (editable) nota total. Create only; blank skips.
  const nTotal = Number(totalStr);
  const targetTotal =
    isEdit || totalStr.trim() === '' || Number.isNaN(nTotal) ? null : Math.round(nTotal);
  const reconciled = targetTotal === null || targetTotal === grandTotal;
  const totalDiff = targetTotal === null ? 0 : grandTotal - targetTotal;

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!reconciled) {
      toast.error(
        `Total item ${formatRupiah(grandTotal)} ≠ total nota ${formatRupiah(targetTotal!)} (selisih ${formatRupiah(Math.abs(totalDiff))}). Perbaiki dulu.`
      );
      return;
    }
    const items = parseRows(rows);
    const unpaidAmount = status === 'BELUM_LUNAS' ? Math.round(Number(unpaid) || 0) : 0;
    const payload = {
      localId: initial?.localId ?? job?.localId ?? crypto.randomUUID(),
      createdAt: initial
        ? new Date(initial.createdAt)
        : job
          ? new Date(job.createdAt)
          : new Date(),
      invoiceCreatedAt: invDate ? new Date(invDate) : new Date(),
      buyer: { name: name.trim(), address: address.trim(), phoneNumber: phone.trim() },
      items,
      status,
      unpaidAmount,
      deliveryStatus,
      imageUrl: imageUrl || job?.imageUrl || '',
      imageHash: job?.imageHash,
    };
    const parsed = invoiceInputSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Data tidak valid');
      return;
    }

    if (isEdit && initial!.sync === 'synced') {
      setSaving(true);
      try {
        await update.mutateAsync(parsed.data);
        await Promise.all([
          utils.invoices.list.invalidate(),
          utils.invoices.getByLocalId.invalidate({ localId: payload.localId }),
        ]);
        toast.success('Bon diperbarui');
        onDone();
      } catch (e) {
        toast.error(
          online ? (e instanceof Error ? e.message : 'Gagal memperbarui') : 'Edit perlu online'
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    enqueue(parsed.data);
    if (job) removeJob(job.localId);
    if (isEdit) {
      toast.success('Draf diperbarui');
    } else {
      const localId = payload.localId;
      toast.success(online ? 'Bon disimpan' : 'Tersimpan — akan sinkron saat online', {
        duration: 5000,
        action: {
          label: 'Lihat',
          onClick: () => router.push(`/invoice/${localId}`),
        },
      });
    }
    onDone();
  }

  const title = isEdit ? 'Edit Bon' : 'Bon Baru';

  const content = busy ? (
          <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
            {job?.imageUrl && (
              <Image
                src={job.imageUrl}
                alt="Foto bon"
                width={900}
                height={1200}
                responsive={false}
                transformation={[{ width: 600, crop: 'at_max' }]}
                className="max-h-48 w-full rounded-md object-contain"
              />
            )}
            <div className="flex items-center gap-2 text-base font-medium">
              <Loader2 className="animate-spin" />
              {uploading ? 'Mengunggah…' : 'Memindai…'}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
              <ImageZoom
                src={imageUrl || job?.imageUrl || ''}
                alt="Foto bon"
                className="max-h-40 w-full rounded-md object-contain"
              />

              {job?.status === 'error' && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Gagal memindai foto — isi manual.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Label>Tanggal bon</Label>
                <Input
                  type="date"
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Nama pembeli</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
                <Label>Alamat</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                <Label>No. telepon</Label>
                <Input
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Barang</Label>
                {rows.map((r, idx) => (
                  <div key={idx} className="flex flex-col gap-2 rounded-md border p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {idx + 1}.
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() =>
                          setRows((rs) => (rs.length > 1 ? rs.filter((_, i) => i !== idx) : rs))
                        }
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Nama</span>
                      <Input
                        placeholder="Nama barang"
                        value={r.itemName}
                        onChange={(e) => setRow(idx, { itemName: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Qty</span>
                        <Input
                          placeholder="Qty"
                          inputMode="decimal"
                          value={r.itemQty}
                          onChange={(e) => setRow(idx, { itemQty: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Harga satuan</span>
                        <Input
                          placeholder="Harga satuan"
                          inputMode="numeric"
                          value={r.unitPrice}
                          onChange={(e) => setRow(idx, { unitPrice: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRows((rs) => [...rs, emptyRow()])}
                >
                  <Plus /> Tambah barang
                </Button>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatRupiah(grandTotal)}</span>
                </div>
                {!isEdit && (
                  <div className="mt-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Total di nota</span>
                      <Input
                        inputMode="numeric"
                        placeholder="mis. dari nota"
                        className="h-8 max-w-40 text-right"
                        value={totalStr}
                        onChange={(e) => setTotalStr(e.target.value)}
                      />
                    </div>
                    {targetTotal !== null &&
                      (reconciled ? (
                        <p className="text-sm text-green-600">✓ Cocok dengan nota</p>
                      ) : (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          Tidak cocok — selisih {formatRupiah(Math.abs(totalDiff))}. Perbaiki item
                          atau total nota.
                        </p>
                      ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                {/* Always exactly one of the two — unlike the list's filter chips,
                    which can be both/neither, a bon's own status is either/or. */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={status === 'LUNAS'}
                    onClick={() => {
                      setStatus('LUNAS');
                      setUnpaid('');
                    }}
                    className={
                      'h-11 flex-1 text-base font-semibold ' +
                      (status === 'LUNAS'
                        ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:text-white'
                        : '')
                    }
                  >
                    Lunas
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={status === 'BELUM_LUNAS'}
                    onClick={() => {
                      setStatus('BELUM_LUNAS');
                      setUnpaid(String(grandTotal));
                    }}
                    className={
                      'h-11 flex-1 text-base font-semibold ' +
                      (status === 'BELUM_LUNAS'
                        ? 'border-destructive bg-destructive text-white hover:bg-destructive hover:text-white'
                        : '')
                    }
                  >
                    Belum Lunas
                  </Button>
                </div>
                {status === 'BELUM_LUNAS' && (
                  <>
                    <Label>Jumlah belum dibayar</Label>
                    <Input
                      inputMode="numeric"
                      value={unpaid}
                      onChange={(e) => setUnpaid(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Pengiriman</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={deliveryStatus === 'DIKIRIM'}
                    onClick={() => setDeliveryStatus('DIKIRIM')}
                    className={
                      'h-11 flex-1 text-base font-semibold ' +
                      (deliveryStatus === 'DIKIRIM'
                        ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-700 hover:text-white'
                        : '')
                    }
                  >
                    Dikirim
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={deliveryStatus === 'BELUM_DIKIRIM'}
                    onClick={() => setDeliveryStatus('BELUM_DIKIRIM')}
                    className={
                      'h-11 flex-1 text-base font-semibold ' +
                      (deliveryStatus === 'BELUM_DIKIRIM'
                        ? 'border-blue-300 bg-blue-300 text-blue-950 hover:bg-blue-300 hover:text-blue-950'
                        : '')
                    }
                  >
                    Belum Dikirim
                  </Button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 border-t bg-background p-4">
              <Button onClick={save} disabled={saving || !reconciled} className="w-full">
                {saving ? 'Menyimpan…' : !reconciled ? 'Total belum cocok' : 'Simpan'}
              </Button>
            </div>
          </>
        );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-2 py-3">
        <Button variant="ghost" size="icon" aria-label="Kembali" onClick={onDone}>
          <ArrowLeft />
        </Button>
        <h1 className="text-lg font-bold">{title}</h1>
      </header>
      {content}
    </div>
  );
}
