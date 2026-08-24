import { router } from '../trpc';
import { authRouter } from './auth';
import { invoicesRouter } from './invoices';

export const appRouter = router({
  auth: authRouter,
  invoices: invoicesRouter,
});

export type AppRouter = typeof appRouter;
