import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  isAnonymous: boolean
}

interface AuthStore {
  user: AuthUser | null
  isLoading: boolean
  initialized: boolean
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: () => void
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isLoading: false,
  initialized: false,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: () => set({ initialized: true }),
}))
