import { create } from 'zustand'
import { TERMS_VERSION } from '../config.js'
import { isPlainObject, readJSON, writeJSON } from '../utils/storage.js'

const KEY = 'terms'
const NOTICE_KEY = 'notice-min'

const readAccepted = () => readJSON(KEY, (v) => isPlainObject(v) && typeof v.version === 'string', null)?.version === TERMS_VERSION

/**
 * The visitor's agreement to the current Terms of Use, and whether the corner
 * notice is minimized. Both live in this browser only.
 */
export const useLegalStore = create((set) => ({
  accepted: readAccepted(),
  // Phones start with the small pill so the notice doesn't cover the page.
  noticeMin: readJSON(NOTICE_KEY, (v) => typeof v === 'boolean', null) ?? (typeof window !== 'undefined' && window.innerWidth < 640),

  accept() {
    writeJSON(KEY, { version: TERMS_VERSION, at: new Date().toISOString() })
    set({ accepted: true })
  },

  setNoticeMin(noticeMin) {
    writeJSON(NOTICE_KEY, noticeMin)
    set({ noticeMin })
  },
}))
