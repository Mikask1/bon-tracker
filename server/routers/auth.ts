import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  generateToken,
  TOKEN_MAX_AGE,
  COOKIE_NAME,
  type Role,
} from '@/lib/utils/jwt';
import type { Context } from '../context';

// APP_PASSWORD kept as the admin password for back-compat.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.APP_PASSWORD;
const PROCESSOR_PASSWORD = process.env.PROCESSOR_PASSWORD;

// ponytail: single shared secret compared against env plaintext; add hashing only
// if the env store stops being trusted.
function setCookie(ctx: Context, token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
  ctx.resHeaders.set(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
}

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ input, ctx }) => {
      let role: Role | null = null;
      if (ADMIN_PASSWORD && input.password === ADMIN_PASSWORD) role = 'admin';
      else if (PROCESSOR_PASSWORD && input.password === PROCESSOR_PASSWORD)
        role = 'processor';

      if (!role) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password salah' });
      }
      setCookie(ctx, generateToken(role), TOKEN_MAX_AGE);
      return { success: true, role };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    setCookie(ctx, '', 0);
    return { success: true };
  }),

  me: protectedProcedure.query(({ ctx }) => ({ authed: true, role: ctx.role })),
});
