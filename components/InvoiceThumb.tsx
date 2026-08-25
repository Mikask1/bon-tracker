import { Image } from '@imagekit/next';
import { ImageIcon } from 'lucide-react';

// Fixed-size square thumbnail for list rows. `size` is the rendered box (px);
// ImageKit crops/resizes to match (smart, focus-point-aware crop).
export function InvoiceThumb({
  src,
  size = 112,
  className = 'size-full object-cover',
}: {
  src: string;
  size?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <ImageIcon className="size-5" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      responsive={false}
      transformation={[{ width: size, height: size, focus: 'auto' }]}
      className={className}
    />
  );
}
