/**
 * The player's provably fair seeds. Players can see them but not change them.
 * In backend mode they live on the server (only the server seed's hash is
 * shown until the pair is retired); in local mode they are kept per account in
 * this browser. Either way a pair is retired after SEED_BETS bets.
 */
import { create } from 'zustand'
import { fairFloats, newClientSeed, newServerSeed, SEED_BETS, sha256Hex } from '../../games/fair.js'
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

/** True while a local Crash round is still in the air (it ends at its auto cash-out or its crash). */
export const crashInPlay = () => {
  const s = readJSON(roundKey('crash'), isPlainObject, null)
  return s?.phase === 'playing' && Date.now() < s.ends
}

/** True while a local Mines, Chicken Cross or Crash round is open (its seeds can't be revealed mid-round). */
export const localRoundOpen = () => crashInPlay() || ['mines', 'chicken'].some((g) => readJSON(roundKey(g), isPlainObject, null)?.phase === 'playing')

export const useFairStore = create((set, get) => ({
  info: null,

  async load() {
    const info = BACKEND_ENABLED ? await backend.fairState() : await publicInfo(localSeeds())
    set({ info })
    return info
  },

  /** Local mode: the seeds for the next bet (the stored nonce moves on), retiring a used-up pair first. */
  take() {
    let seeds = localSeeds()
    const retire = seeds.nonce >= SEED_BETS && !localRoundOpen()
    if (retire) {
      seeds = { serverSeed: newServerSeed(), clientSeed: newClientSeed(), nonce: 0, previous: { serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: seeds.nonce } }
    }
    writeJSON(seedKey(owner()), { ...seeds, nonce: seeds.nonce + 1 })
    if (retire) publicInfo({ ...seeds, nonce: seeds.nonce + 1 }).then((info) => set({ info }))
    else set((s) => ({ info: s.info ? { ...s.info, nonce: seeds.nonce + 1 } : s.info }))
    return seeds
  },

  /** Backend mode: notes that the server used `nonce` for a bet. */
  used(nonce) {
    if (!Number.isInteger(nonce)) return
    // A lower nonce means the server retired the pair: fetch the new hash and the revealed seed.
    if (get().info && nonce + 1 < get().info.nonce) get().load().catch(() => {})
    else set((s) => ({ info: s.info ? { ...s.info, nonce: nonce + 1 } : s.info }))
  },
}))

/** Local mode: floats for the next bet, plus the nonce used. */
export async function nextFloats(count) {
  const seeds = useFairStore.getState().take()
  return { floats: await fairFloats(seeds, count), nonce: seeds.nonce }
}
