import { create } from 'zustand'

export const useUiStore = create((set) => ({
  query: '',
  category: 'all',
  sort: 'volume',
  auth: { open: false, mode: 'login', message: '' },
  resetOpen: false,
  feedCollapsed: false,
  endingSoon: false,

  setQuery: (query) => set({ query }),
  setCategory: (category) => set({ category }),
  setSort: (sort) => set({ sort }),
  openAuth: (mode = 'login', message = '') => set({ auth: { open: true, mode, message } }),
  closeAuth: () => set((s) => ({ auth: { ...s.auth, open: false } })),
  setResetOpen: (resetOpen) => set({ resetOpen }),
  toggleFeed: () => set((s) => ({ feedCollapsed: !s.feedCollapsed })),
  toggleEndingSoon: () => set((s) => ({ endingSoon: !s.endingSoon })),
}))
