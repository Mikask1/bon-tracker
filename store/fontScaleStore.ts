import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Global text-size scale (multiplies the root font-size). Tailwind sizing is
// rem-based, so this scales the whole UI — for older and younger users alike.
interface FontScaleState {
  scale: number;
  setScale: (n: number) => void;
}

export const useFontScale = create<FontScaleState>()(
  persist(
    (set) => ({
      scale: 1,
      setScale: (scale) => set({ scale }),
    }),
    { name: 'tsh-font' }
  )
);
