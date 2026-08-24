'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoginGate } from '@/components/LoginGate';
import { trpc } from '@/lib/trpc/client';
import { useFontScale } from '@/store/fontScaleStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Check, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const OPTIONS = [
  { label: 'Kecil', scale: 0.9 },
  { label: 'Sedang', scale: 1 },
  { label: 'Besar', scale: 1.15 },
  { label: 'Sangat Besar', scale: 1.3 },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Pemilik',
  processor: 'Pegawai',
};

export default function SettingsPage() {
  return (
    <LoginGate>
      <Settings />
    </LoginGate>
  );
}

function Settings() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const scale = useFontScale((s) => s.scale);
  const setScale = useFontScale((s) => s.setScale);
  const role = useAuthStore((s) => s.role);
  const clear = useAuthStore((s) => s.clear);

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      clear(); // gate flips back to login
      router.push('/');
    },
    onError: (e) => toast.error(e.message || 'Gagal keluar'),
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-2 py-3 pr-4">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">Pengaturan</h1>
        {role && (
          <Badge variant={role === 'admin' ? 'default' : 'secondary'} className="ml-auto">
            {ROLE_LABEL[role]}
          </Badge>
        )}
      </header>

      <div className="flex flex-col gap-6 p-4">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Ukuran teks</h2>
          {OPTIONS.map((o) => (
            <Button
              key={o.scale}
              variant={scale === o.scale ? 'default' : 'outline'}
              className="h-14 w-full justify-between"
              onClick={() => setScale(o.scale)}
            >
              <span style={{ fontSize: `${o.scale}em` }}>Aa — {o.label}</span>
              {scale === o.scale && <Check className="size-5" />}
            </Button>
          ))}
        </section>

        <Button
          variant="outline"
          className="h-12 w-full text-destructive"
          onClick={() => setConfirming(true)}
        >
          <LogOut className="size-4" /> Logout
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Logout?</DialogTitle>
            <DialogDescription>Keluar dari akun ini.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-12"
              onClick={() => setConfirming(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="h-12"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              {logout.isPending ? 'Logout…' : 'Ya, logout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
