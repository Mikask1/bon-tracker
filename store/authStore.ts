import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Role } from '@/lib/utils/jwt';

// Persisted client-side "logged in" flag + role so the gate stays open offline.
// The httpOnly cookie remains the real server-side auth; this is just UX. Role
// only gates UI — server enforces admin-only routes regardless.
interface AuthState {
  authed: boolean;
  role: Role | null;
  setAuth: (role: Role) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      authed: false,
      role: null,
      setAuth: (role) => set({ authed: true, role }),
      clear: () => set({ authed: false, role: null }),
    }),
    { name: 'tsh-auth' }
  )
);
