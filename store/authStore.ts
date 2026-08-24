import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Persisted client-side "logged in" flag so the gate stays open offline.
// The httpOnly cookie remains the real server-side auth; this is just UX.
interface AuthState {
  authed: boolean;
  setAuthed: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      authed: false,
      setAuthed: (v) => set({ authed: v }),
    }),
    { name: 'tsh-auth' }
  )
);
