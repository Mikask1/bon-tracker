import { getUploadAuthParams } from '@imagekit/next/server';
import { cookies } from 'next/headers';
import { verifyToken, COOKIE_NAME } from '@/lib/utils/jwt';

// Signed upload params for client-side ImageKit uploads. Guarded by the auth cookie
// so only a logged-in client can obtain upload credentials.
export async function GET() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { token: t, expire, signature } = getUploadAuthParams({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY!,
  });

  return Response.json({
    token: t,
    expire,
    signature,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  });
}
