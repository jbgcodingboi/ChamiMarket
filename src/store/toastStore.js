import { create } from 'zustand'

let counter = 0
const timers = new Map()

export const useToastStore = create((set, get) => ({
  toasts: [],
  push({ title, description = '', tone = 'info', duration = 4500 }) {
    const id = ++counter
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, title, description, tone }] }))
    timers.set(id, setTimeout(() => get().dismiss(id), duration))
    return id
  },
  dismiss(id) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = (opts) => useToastStore.getState().push(opts)
