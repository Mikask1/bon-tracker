import { upload } from '@imagekit/next';

export async function uploadImage(file: File): Promise<string> {
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
