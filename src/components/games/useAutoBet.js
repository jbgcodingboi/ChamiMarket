import { useEffect, useRef, useState } from 'react'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'

export const DEFAULT_AUTO = { count: '10', onWin: 'reset', winPct: '0', onLoss: 'reset', lossPct: '0', stopProfit: '', stopLoss: '' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Runs bets one after another: `play(amount)` places one and resolves to
 * { net } (or null to stop). Handles bet sizing on wins and losses
 * (Martingale and friends), the bet count and the stop-on-profit/loss limits.
 */
export function useAutoBet() {
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState({ played: 0, profit: 0 })
  const stopRef = useRef(false)
  useEffect(
    () => () => {
      stopRef.current = true
    },
    [],
  )

  const start = async ({ settings, baseBet, play, balance, gapMs = 300 }) => {
    const count = Math.max(0, Math.floor(Number(settings.count) || 0))
    const stopProfit = Number(settings.stopProfit) || 0
    const stopLoss = Number(settings.stopLoss) || 0
    stopRef.current = false
    setRunning(true)
    setStats({ played: 0, profit: 0 })
    let bet = baseBet
    let played = 0
    let profit = 0
    try {
      while (!stopRef.current && (count === 0 || played < count)) {
        bet = Math.max(0.1, roundMoney(bet))
        if (bet > balance()) {
          toast({ tone: 'info', title: 'Auto bet stopped', description: 'Not enough chips for the next bet.' })
          break
        }
        const r = await play(bet)
        if (!r) break
        played++
        profit = roundMoney(profit + r.net)
        setStats({ played, profit })
        if (r.net > 0) bet = settings.onWin === 'increase' ? bet * (1 + (Number(settings.winPct) || 0) / 100) : baseBet
        else if (r.net < 0) bet = settings.onLoss === 'increase' ? bet * (1 + (Number(settings.lossPct) || 0) / 100) : baseBet
        if (stopProfit > 0 && profit >= stopProfit) break
        if (stopLoss > 0 && -profit >= stopLoss) break
        if (gapMs) await sleep(gapMs)
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Auto bet stopped', description: err.message })
    } finally {
      setRunning(false)
    }
  }

  const stop = () => {
    stopRef.current = true
  }
  return { running, stats, start, stop }
}
