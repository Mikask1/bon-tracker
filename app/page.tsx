import { LoginGate } from '@/components/LoginGate';
import { InvoiceList } from '@/components/InvoiceList';

export default function Home() {
  return (
    <LoginGate>
      <InvoiceList />
    </LoginGate>
  );
}
