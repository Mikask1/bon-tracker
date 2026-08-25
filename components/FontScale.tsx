'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { useFontScale } from '@/store/fontScaleStore';

// Applies the persisted scale to the document root. Mount once (in Providers).
export function FontScaleApplier() {
  const scale = useFontScale((s) => s.scale);
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale * 100}%`;
  }, [scale]);
  return null;
}

// Header entry point to the settings page. Icon carries a printed word rather
// than relying on the glyph alone, and the target is sized above the 44px floor.
export function SettingsButton() {
  return (
    <Button
      asChild
      variant="outline"
      aria-label="Pengaturan"
      className="h-12 w-14 flex-col gap-0.5 px-1 py-1"
    >
      <Link href="/settings">
        <Settings className="size-5" />
        <span className="text-[11px] font-medium leading-none">Atur</span>
      </Link>
    </Button>
  );
}
