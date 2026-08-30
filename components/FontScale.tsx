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

// Entry point to the settings page, sitting in the bottom bar beside Bon Baru.
// Squared off at the bar's own height so the two read as one row of controls.
export function SettingsButton() {
  return (
    <Button asChild variant="outline" aria-label="Pengaturan" className="size-14 shrink-0">
      <Link href="/settings">
        <Settings className="size-5" />
      </Link>
    </Button>
  );
}
