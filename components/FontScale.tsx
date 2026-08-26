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

// Header entry point to the settings page. Sized above the 44px touch floor.
export function SettingsButton() {
  return (
    <Button asChild variant="outline" aria-label="Pengaturan" className="size-12">
      <Link href="/settings">
        <Settings className="size-5" />
      </Link>
    </Button>
  );
}
