import { create } from 'zustand'

export const useUiStore = create((set) => ({
  query: '',
  category: 'all',
  sort: 'volume',
  auth: { open: false, mode: 'login', message: '' },
  resetOpen: false,
  deleteOpen: false,
  // Backend mode: a freshly issued recovery code to show once ({ code, reason }), or null.
  recovery: null,
  feedCollapsed: false,
  endingSoon: false,

  setQuery: (query) => set({ query }),
  setCategory: (category) => set({ category }),
  setSort: (sort) => set({ sort }),
  openAuth: (mode = 'login', message = '') => set({ auth: { open: true, mode, message } }),
  closeAuth: () => set((s) => ({ auth: { ...s.auth, open: false } })),
  setResetOpen: (resetOpen) => set({ resetOpen }),
  setDeleteOpen: (deleteOpen) => set({ deleteOpen }),
  showRecovery: (code, reason) => set({ recovery: code ? { code, reason } : null }),
  toggleFeed: () => set((s) => ({ feedCollapsed: !s.feedCollapsed })),
  toggleEndingSoon: () => set((s) => ({ endingSoon: !s.endingSoon })),
}))
