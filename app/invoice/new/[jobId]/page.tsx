'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { LoginGate } from '@/components/LoginGate';
import { InvoiceForm } from '@/components/InvoiceForm';

export default function NewInvoiceJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();
  return (
    <LoginGate>
      <InvoiceForm jobId={jobId} onDone={() => router.push('/')} />
    </LoginGate>
  );
}
