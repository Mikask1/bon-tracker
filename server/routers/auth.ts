import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  generateToken,
  TOKEN_MAX_AGE,
  COOKIE_NAME,
} from '@/lib/utils/jwt';
import type { Context } from '../context';

const APP_PASSWORD = process.env.APP_PASSWORD;

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
      if (!APP_PASSWORD || input.password !== APP_PASSWORD) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password salah' });
      }
      setCookie(ctx, generateToken(), TOKEN_MAX_AGE);
      return { success: true };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    setCookie(ctx, '', 0);
    return { success: true };
  }),

  me: protectedProcedure.query(() => ({ authed: true })),
});
