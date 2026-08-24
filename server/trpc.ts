import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import superjson from 'superjson';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.role) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, role: ctx.role } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

// admin-only: editing or deleting saved invoices. Processors can only create.
const isAdmin = t.middleware(({ ctx, next }) => {
  if (ctx.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Hanya admin' });
  }
  return next({ ctx: { ...ctx, role: ctx.role } });
});

export const adminProcedure = t.procedure.use(isAuthed).use(isAdmin);
