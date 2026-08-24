'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import { useScanJobStore } from '@/store/scanJobStore';
import { thumbUrl, toYMD, type InvoiceRow } from '@/hooks/useInvoiceRows';
import { ImageZoom } from '@/components/ImageZoom';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  computeGrandTotal,
  invoiceInputSchema,
  type Status,
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
  open,
  onOpenChange,
  initial,
  jobId,
  uploading,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: InvoiceRow; // edit an existing invoice
  jobId?: string; // review a background scan job
  uploading?: boolean; // photo is uploading, before the job exists
  onSaved?: () => void;
}) {
  const isEdit = !!initial;
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
  const [status, setStatus] = useState<Status>('LUNAS');
  const [unpaid, setUnpaid] = useState('');
  const [invDate, setInvDate] = useState(''); // yyyy-mm-dd; date printed on the nota
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState('');
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
    setStatus('LUNAS');
    setUnpaid('');
    setImageUrl('');
    setPreview('');
    setTotalStr('');
    setInvDate(toYMD(new Date()));
  }

  // Populate once per open: from the invoice (edit), the finished scan (done), or blank.
  useEffect(() => {
    if (!open) {
      populatedRef.current = false;
      return;
    }
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
      setImageUrl(initial.imageUrl);
      setPreview(initial.imageUrl ? thumbUrl(initial.imageUrl, 800) : '');
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
        setStatus('LUNAS');
        setUnpaid('');
        setImageUrl(job.imageUrl);
        setPreview(job.imageUrl ? thumbUrl(job.imageUrl, 800) : '');
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
        setPreview(job.imageUrl ? thumbUrl(job.imageUrl, 800) : '');
        populatedRef.current = true;
      }
      // scanning: wait — fields stay hidden until done
      return;
    }

    loadBlank();
    populatedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.status, uploading]);

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
        onOpenChange(false);
        onSaved?.();
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
    toast.success(
      isEdit
        ? 'Draf diperbarui'
        : online
          ? 'Bon disimpan'
          : 'Tersimpan — akan sinkron saat online'
    );
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{isEdit ? 'Edit Bon' : 'Bon Baru'}</DrawerTitle>
        </DrawerHeader>

        {busy ? (
          <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
            {job?.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl(job.imageUrl, 600)}
                alt="Foto bon"
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
              {preview && (
                <ImageZoom
                  src={imageUrl || job?.imageUrl || preview}
                  thumb={preview}
                  alt="Foto bon"
                  className="max-h-40 w-full rounded-md object-contain"
                />
              )}

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
                <Select
                  value={status}
                  onValueChange={(v) => {
                    const s = v as Status;
                    setStatus(s);
                    setUnpaid(s === 'BELUM_LUNAS' ? String(grandTotal) : '');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LUNAS">Lunas</SelectItem>
                    <SelectItem value="BELUM_LUNAS">Belum Lunas</SelectItem>
                  </SelectContent>
                </Select>
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
            </div>

            <DrawerFooter>
              <Button onClick={save} disabled={saving || !reconciled}>
                {saving ? 'Menyimpan…' : !reconciled ? 'Total belum cocok' : 'Simpan'}
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
