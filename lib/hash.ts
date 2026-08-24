// SHA-256 hex of a file's bytes — the dedupe key for re-uploaded invoice photos.
// Uses the browser SubtleCrypto (secure context only; app is HTTPS/localhost).
export async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
