import { useEffect } from 'react'
import { useAccountStore } from '../../store/accountStore.js'
import { useGameStore } from '../../store/gameStore.js'

/** Keeps the chip wallet in step with the signed-in account (or the guest wallet). */
export function useWalletSync() {
  const userId = useAccountStore((s) => s.user?.id ?? null)
  const syncOwner = useGameStore((s) => s.syncOwner)
  useEffect(() => {
    syncOwner()
  }, [userId, syncOwner])
}
