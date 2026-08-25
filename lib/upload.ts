import { upload } from '@imagekit/next';
import { compressForStorage } from '@/lib/compressImage';

// What lands in ImageKit is the shrunk, view-only copy — it backs thumbnails,
// the form preview and the zoom dialog, nothing else. Gemini never reads this
// file: the scan call carries the original bytes straight from the browser (see
// prepareScanImage), so storage stays cheap without costing OCR accuracy.
export async function uploadImage(file: File): Promise<string> {
  const stored = await compressForStorage(file);
  const res = await fetch('/api/upload-auth');
  if (!res.ok) throw new Error('Gagal ambil kredensial upload');
  const auth = await res.json();
  const result = await upload({
    file: stored,
    fileName: `${crypto.randomUUID()}.jpg`,
    folder: '/invoices',
    useUniqueFileName: false,
    overwriteFile: false,
    ...auth,
  });
  return result.url ?? '';
}
