/**
 * The player's provably fair seeds. In backend mode they live on the server
 * (only the server seed's hash is shown until rotation); in local mode they
 * are kept per account in this browser.
 */
import { create } from 'zustand'
import { fairFloats, isClientSeed, newClientSeed, newServerSeed, sha256Hex } from '../../games/fair.js'
import { useAccountStore } from '../../store/accountStore.js'
import { isPlainObject, readJSON, writeJSON } from '../../utils/storage.js'
import * as backend from '../backend/api.js'
import { BACKEND_ENABLED } from '../backend/config.js'

const owner = () => useAccountStore.getState().user?.id ?? 'guest'
const seedKey = (o) => `games:${o}:fair`
export const roundKey = (game) => `games:${owner()}:${game}`

const isSeeds = (v) => isPlainObject(v) && typeof v.serverSeed === 'string' && typeof v.clientSeed === 'string' && Number.isInteger(v.nonce)

function localSeeds() {
  const o = owner()
  let seeds = readJSON(seedKey(o), isSeeds, null)
  if (!seeds) {
    seeds = { serverSeed: newServerSeed(), clientSeed: newClientSeed(), nonce: 0, previous: null }
    writeJSON(seedKey(o), seeds)
  }
  return seeds
}

async function publicInfo(seeds) {
  return {
    serverSeedHash: await sha256Hex(seeds.serverSeed),
    clientSeed: seeds.clientSeed,
    nonce: seeds.nonce,
    previous: seeds.previous ? { ...seeds.previous, serverSeedHash: await sha256Hex(seeds.previous.serverSeed) } : null,
  }
}

/** True while a local Mines or Chicken Cross round is open (seeds can't change mid-round). */
const localRoundOpen = () => ['mines', 'chicken'].some((g) => readJSON(roundKey(g), isPlainObject, null)?.phase === 'playing')

export const useFairStore = create((set, get) => ({
  info: null,

  async load() {
    const info = BACKEND_ENABLED ? await backend.fairState() : await publicInfo(localSeeds())
    set({ info })
    return info
  },

  /** Local mode: the seeds for the next bet (the stored nonce moves on). */
  take() {
    const seeds = localSeeds()
    writeJSON(seedKey(owner()), { ...seeds, nonce: seeds.nonce + 1 })
    set((s) => ({ info: s.info ? { ...s.info, nonce: seeds.nonce + 1 } : s.info }))
    return seeds
  },

  /** Backend mode: notes that the server used `nonce` for a bet. */
  used(nonce) {
    if (Number.isInteger(nonce)) set((s) => ({ info: s.info ? { ...s.info, nonce: nonce + 1 } : s.info }))
  },

  /** Reveals the current server seed and starts a new pair with the given client seed. */
  async rotate(clientSeed) {
    if (!isClientSeed(clientSeed)) throw new Error('Client seeds use 1 to 64 letters, numbers or symbols, with no spaces.')
    let info
    if (BACKEND_ENABLED) {
      info = await backend.fairRotate(clientSeed)
    } else {
      if (localRoundOpen()) throw new Error('Finish your Mines or Chicken Cross round before changing seeds.')
      const seeds = localSeeds()
      const next = { serverSeed: newServerSeed(), clientSeed, nonce: 0, previous: { serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: seeds.nonce } }
      writeJSON(seedKey(owner()), next)
      info = await publicInfo(next)
    }
    set({ info })
    return get().info
  },
}))

/** Local mode: floats for the next bet, plus the nonce used. */
export async function nextFloats(count) {
  const seeds = useFairStore.getState().take()
  return { floats: await fairFloats(seeds, count), nonce: seeds.nonce }
}
