'use client';

import { useEffect, useState } from 'react';
import { upload } from '@imagekit/next';
import { trpc } from '@/lib/trpc/client';
import { usePendingStore } from '@/store/pendingInvoiceStore';
import { thumbUrl, type InvoiceRow } from '@/hooks/useInvoiceRows';
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
import { Camera, Plus, Trash2, Loader2 } from 'lucide-react';
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

async function uploadImage(file: File): Promise<string> {
  const res = await fetch('/api/upload-auth');
  if (!res.ok) throw new Error('Gagal ambil kredensial upload');
  const auth = await res.json();
  const result = await upload({
    file,
    fileName: `${crypto.randomUUID()}.jpg`,
    folder: '/invoices',
    useUniqueFileName: false,
    overwriteFile: false,
    ...auth,
  });
  return result.url ?? '';
}

function readBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ base64: dataUrl.split(',')[1], mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function InvoiceForm({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: InvoiceRow;
  onSaved?: () => void;
}) {
  const isEdit = !!initial;
  const enqueue = usePendingStore((s) => s.enqueue);
  const utils = trpc.useUtils();
  const scan = trpc.invoices.scan.useMutation();
  const update = trpc.invoices.update.useMutation();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [status, setStatus] = useState<Status>('LUNAS');
  const [unpaid, setUnpaid] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);

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

  // Load initial values (edit) or clear (create) each time the drawer opens.
  useEffect(() => {
    if (!open) return;
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
    } else {
      setName('');
      setAddress('');
      setPhone('');
      setRows([emptyRow()]);
      setStatus('LUNAS');
      setUnpaid('');
      setImageUrl('');
      setPreview('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grandTotal = computeGrandTotal(parseRows(rows));

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setPreview(URL.createObjectURL(file));
    try {
      const [url, { base64, mimeType }] = await Promise.all([
        uploadImage(file),
        readBase64(file),
      ]);
      setImageUrl(url);
      const data = await scan.mutateAsync({ base64, mimeType });
      setName(data.buyer.name || '');
      setAddress(data.buyer.address || '');
      setPhone(data.buyer.phoneNumber || '');
      if (data.items?.length) {
        setRows(
          data.items.map((i) => ({
            itemName: i.itemName || '',
            itemQty: String(i.itemQty || 1),
            unitPrice: String(Math.round(i.unitPrice || 0)),
          }))
        );
      }
      toast.success('Data terisi dari foto — periksa lalu simpan');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memindai foto');
    } finally {
      setScanning(false);
    }
  }

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    const items = parseRows(rows);
    const unpaidAmount = status === 'BELUM_LUNAS' ? Math.round(Number(unpaid) || 0) : 0;
    const payload = {
      localId: initial?.localId ?? crypto.randomUUID(),
      createdAt: initial ? new Date(initial.createdAt) : new Date(),
      buyer: { name: name.trim(), address: address.trim(), phoneNumber: phone.trim() },
      items,
      status,
      unpaidAmount,
      imageUrl,
    };
    const parsed = invoiceInputSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Data tidak valid');
      return;
    }

    // Synced invoice → server update (online). Draft or new → durable queue.
    if (isEdit && initial!.sync === 'synced') {
      setSaving(true);
      try {
        await update.mutateAsync(parsed.data);
        await Promise.all([
          utils.invoices.list.invalidate(),
          utils.invoices.getByLocalId.invalidate({ localId: payload.localId }),
        ]);
        toast.success('Invoice diperbarui');
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
    toast.success(
      isEdit
        ? 'Draft diperbarui'
        : online
          ? 'Invoice disimpan'
          : 'Tersimpan — akan sinkron saat online'
    );
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{isEdit ? 'Edit Invoice' : 'Invoice Baru'}</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
          <div className="flex flex-col gap-2">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Foto invoice"
                className="max-h-40 w-full rounded-md object-contain"
              />
            )}
            <label className="w-full">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={!online || scanning}
                onChange={handlePhoto}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={!online || scanning}
                asChild
              >
                <span>
                  {scanning ? <Loader2 className="animate-spin" /> : <Camera />}
                  {scanning
                    ? 'Memindai…'
                    : online
                      ? 'Foto / Scan Invoice'
                      : 'Scan perlu online'}
                </span>
              </Button>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Nama pembeli</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Label>Alamat *</Label>
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
              <div key={idx} className="flex flex-col gap-1 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Nama barang"
                    value={r.itemName}
                    onChange={(e) => setRow(idx, { itemName: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setRows((rs) => (rs.length > 1 ? rs.filter((_, i) => i !== idx) : rs))
                    }
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Qty"
                    inputMode="decimal"
                    value={r.itemQty}
                    onChange={(e) => setRow(idx, { itemQty: e.target.value })}
                  />
                  <Input
                    placeholder="Harga satuan"
                    inputMode="numeric"
                    value={r.unitPrice}
                    onChange={(e) => setRow(idx, { unitPrice: e.target.value })}
                  />
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

          <div className="flex items-center justify-between text-base font-semibold">
            <span>Grand Total</span>
            <span>{formatRupiah(grandTotal)}</span>
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
          <Button onClick={save} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
