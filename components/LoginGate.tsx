'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const authed = useAuthStore((s) => s.authed);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pw, setPw] = useState('');

  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => setAuth(data.role),
    onError: (e) => toast.error(e.message || 'Gagal masuk'),
  });

  useEffect(() => setMounted(true), []);
  if (!mounted) return null; // avoid persisted-state hydration flash

  if (authed) return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Toko Sinar Harapan</h1>
      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ password: pw });
        }}
      >
        <Input
          type="password"
          placeholder="Kata sandi"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        <Button type="submit" disabled={login.isPending || !pw}>
          {login.isPending ? 'Masuk…' : 'Masuk'}
        </Button>
      </form>
    </div>
  );
}
