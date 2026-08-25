'use client';

import { useRouter } from 'next/navigation';
import { LoginGate } from '@/components/LoginGate';
import { InvoiceForm } from '@/components/InvoiceForm';

export default function NewInvoicePage() {
  const router = useRouter();
  return (
    <LoginGate>
      <InvoiceForm onDone={() => router.push('/')} />
    </LoginGate>
  );
}
