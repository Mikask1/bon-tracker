// Two renditions of a picked photo, with opposite goals:
//
// - compressForStorage(): what gets uploaded to ImageKit and kept forever. Small
//   is the whole point — this copy is view-only (thumbnails, preview, zoom), and
//   ImageKit shrinks it further at serve time.
// - prepareScanImage(): what gets sent to Gemini, once, at scan time. Quality is
//   the whole point, so the original bytes are passed through untouched unless
//   they're too large to survive the request body, in which case they're scaled
//   down as gently as possible.

const STORAGE_MAX_DIMENSION = 1000;
const STORAGE_QUALITY = 0.3;

// Raw bytes we're willing to base64 into a tRPC request. base64 inflates by ~4/3,
// so this lands around 3.4MB on the wire — under the ~4.5MB body cap common to
// serverless hosts. Anything bigger gets scaled down instead of failing to send.
const SCAN_MAX_BYTES = 2.5 * 1024 * 1024;
const SCAN_MAX_DIMENSION = 2400;
const SCAN_QUALITY = 0.9;

async function reencode(
  file: File,
  maxDimension: number,
  quality: number
): Promise<File | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  if (!blob) return null;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

// Shrink hard — this is the copy that occupies ImageKit storage for good.
export async function compressForStorage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const out = await reencode(file, STORAGE_MAX_DIMENSION, STORAGE_QUALITY);
    // Already smaller than what we'd produce (e.g. a tiny re-upload) — keep it.
    if (!out || out.size >= file.size) return file;
    return out;
  } catch {
    return file; // format the browser can't decode (e.g. some HEIC) — upload as-is
  }
}

export interface ScanImage {
  base64: string;
  mimeType: string;
}

// Full-quality bytes for the one-shot vision call. Returns null when the photo
// can't be made to fit, and the caller falls back to scanning the stored URL.
export async function prepareScanImage(file: File): Promise<ScanImage | null> {
  try {
    let out = file;
    if (file.size > SCAN_MAX_BYTES) {
      const smaller = await reencode(file, SCAN_MAX_DIMENSION, SCAN_QUALITY);
      if (!smaller || smaller.size > SCAN_MAX_BYTES) return null;
      out = smaller;
    }
    return { base64: await toBase64(out), mimeType: out.type || 'image/jpeg' };
  } catch {
    return null;
  }
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  // Chunked so a multi-megabyte photo doesn't blow the argument limit of apply().
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
