import { create } from 'zustand'
import { TERMS_VERSION } from '../config.js'
import { isPlainObject, readJSON, writeJSON } from '../utils/storage.js'

const KEY = 'terms'

const readAccepted = () => readJSON(KEY, (v) => isPlainObject(v) && typeof v.version === 'string', null)?.version === TERMS_VERSION

/** The visitor's agreement to the current Terms of Use, kept in this browser only. */
export const useLegalStore = create((set) => ({
  accepted: readAccepted(),

  accept() {
    writeJSON(KEY, { version: TERMS_VERSION, at: new Date().toISOString() })
    set({ accepted: true })
  },
}))
