import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, httpLink, splitLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

// Batch queries (GET), but send mutations unbatched (POST) via httpLink. Otherwise a
// mutation firing in the same tick as a query (e.g. resuming a scan on mount) gets
// batched into a GET request and the server rejects it (mutations require POST).
export function getTRPCClient() {
  return trpc.createClient({
    links: [
      splitLink({
        condition: (op) => op.type === 'mutation',
        true: httpLink({ url: '/api/trpc', transformer: superjson }),
        false: httpBatchLink({ url: '/api/trpc', transformer: superjson }),
      }),
    ],
  });
}
