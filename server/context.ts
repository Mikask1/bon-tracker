import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import connectDB from '@/lib/db';
import { verifyToken, COOKIE_NAME } from '@/lib/utils/jwt';

export async function createContext(opts: FetchCreateContextFnOptions) {
  await connectDB();

  let role: import('@/lib/utils/jwt').Role | null = null;
  const cookieHeader = opts.req.headers.get('cookie');
  if (cookieHeader) {
    const token = parseCookies(cookieHeader)[COOKIE_NAME];
    if (token) role = verifyToken(token);
  }

  return { authed: !!role, role, req: opts.req, resHeaders: opts.resHeaders };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

function parseCookies(header: string): Record<string, string> {
  return header.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) acc[key] = decodeURIComponent(value);
    return acc;
  }, {} as Record<string, string>);
}
