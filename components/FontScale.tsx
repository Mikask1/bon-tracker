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

// Bottom-bar entry point to the settings page.
export function SettingsButton() {
  return (
    <Button asChild variant="ghost" size="icon" aria-label="Pengaturan">
      <Link href="/settings">
        <Settings className="size-5" />
      </Link>
    </Button>
  );
}
