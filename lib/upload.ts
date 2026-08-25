import { upload } from '@imagekit/next';
import { compressImage } from '@/lib/compressImage';

export async function uploadImage(file: File): Promise<string> {
  const compressed = await compressImage(file);
  const res = await fetch('/api/upload-auth');
  if (!res.ok) throw new Error('Gagal ambil kredensial upload');
  const auth = await res.json();
  const result = await upload({
    file: compressed,
    fileName: `${crypto.randomUUID()}.jpg`,
    folder: '/invoices',
    useUniqueFileName: false,
    overwriteFile: false,
    ...auth,
  });
  return result.url ?? '';
}
