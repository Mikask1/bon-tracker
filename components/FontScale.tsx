'use client';

import { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ALargeSmall, Check } from 'lucide-react';
import { useFontScale } from '@/store/fontScaleStore';

const OPTIONS = [
  { label: 'Kecil', scale: 0.9 },
  { label: 'Sedang', scale: 1 },
  { label: 'Besar', scale: 1.15 },
  { label: 'Sangat Besar', scale: 1.3 },
];

// Applies the persisted scale to the document root. Mount once (in Providers).
export function FontScaleApplier() {
  const scale = useFontScale((s) => s.scale);
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale * 100}%`;
  }, [scale]);
  return null;
}

// Trigger button + drawer of size presets.
export function FontScaleButton() {
  const [open, setOpen] = useState(false);
  const scale = useFontScale((s) => s.scale);
  const setScale = useFontScale((s) => s.setScale);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ukuran teks"
        onClick={() => setOpen(true)}
      >
        <ALargeSmall className="size-6" />
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-center">
            <DrawerTitle>Ukuran Teks</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-8">
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
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
