'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/* eslint-disable @next/next/no-img-element */

// Tap a photo to view it full-size in a dialog. `src` is the full image; `thumb`
// (optional) is the smaller version shown inline.
export function ImageZoom({
  src,
  thumb,
  alt = 'Foto',
  className,
}: {
  src: string;
  thumb?: string;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={thumb ?? src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in ${className ?? ''}`}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[95vw] border-0 bg-transparent p-0 shadow-none sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img
            src={src}
            alt={alt}
            onClick={() => setOpen(false)}
            className="max-h-[85dvh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
