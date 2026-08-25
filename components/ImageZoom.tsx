'use client';

import { useState } from 'react';
import { Image } from '@imagekit/next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// Tap a photo to view it full-size in a dialog. `src` is the raw ImageKit URL;
// ImageKit resizes the inline thumbnail and the zoomed view on the fly (no
// upscaling, aspect ratio preserved — see `crop: 'at_max'`).
export function ImageZoom({
  src,
  alt = 'Foto',
  className,
  thumbSize = 800,
}: {
  src: string;
  alt?: string;
  className?: string;
  thumbSize?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <Image
        src={src}
        alt={alt}
        width={900}
        height={1200}
        responsive={false}
        transformation={[{ width: thumbSize, crop: 'at_max' }]}
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in ${className ?? ''}`}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[95vw] border-0 bg-transparent p-0 shadow-none sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <Image
            src={src}
            alt={alt}
            width={1000}
            height={1333}
            responsive={false}
            // Matches STORAGE_MAX_DIMENSION — asking for more than was stored
            // only buys an extra cached variant of the same pixels.
            transformation={[{ width: 1000, crop: 'at_max' }]}
            onClick={() => setOpen(false)}
            className="max-h-[85dvh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
