import { active, contending, inDeal, nextActiveFrom, nextNeedingAction, potOf } from './legality'
import { gusaCheck, rankHands } from './ranking'
import type { RankedHand } from './ranking'
import type { DealReason, GameState, PlayerState, Seat } from './types'

export function activeCount(state: GameState): number {
  return state.players.filter(active).length
}

/**
 * After any betting action: resolve the deal when the round is over,
 * otherwise hand the action to the next seat that owes one. `fresh` marks a
 * deal start, where the search begins after the dealer.
 */
export function settleTurn(state: GameState, from: Seat, fresh = false): void {
  const contenders = state.players.filter(contending)
  if (contenders.length <= 1) {
    resolveDeal(state, 'uncontested')
    return
  }
  const livePlayers = contenders.filter((p) => !p.allIn)
  const matched = (p: PlayerState) => p.committed === state.currentBet
  const roundOver =
    livePlayers.every((p) => p.actedSinceRaise && matched(p)) ||
    (livePlayers.length <= 1 && livePlayers.every(matched))
  if (roundOver) {
    resolveDeal(state, 'showdown')
    return
  }
  if (fresh || from === state.seatToAct) {
    state.seatToAct = nextNeedingAction(state, from)
    if (state.seatToAct === null) {
      // a lone live seat that has matched has no one left to bet against
      resolveDeal(state, 'showdown')
    }
  }
}

/**
 * Showdown or fold-out: the 구사 check may void the deal (pot carried, same
 * dealer); otherwise the pot is split into side pots by committed level,
 * every slice going to the best eligible hand(s). Then broke seats go out,
 * the dealer rotates and the session ends when fewer than two remain or
 * `maxDeals` is reached.
 */
function resolveDeal(state: GameState, reason: DealReason): void {
  const cfg = state.config
  const n = state.players.length
  const contenders = state.players.flatMap((p, seat) => (contending(p) ? [seat] : []))
  const pot = potOf(state)
  const awards = new Array<number>(n).fill(0)
  let hands: RankedHand[] = []
  let winners: Seat[] = []
  let gusa: { seat: Seat; label: string } | null = null

  if (reason === 'uncontested' || contenders.length === 1) {
    reason = 'uncontested'
    awards[contenders[0]] = pot
    winners = [contenders[0]]
  } else {
    const inputs = contenders.map((seat) => ({ seat, cards: state.players[seat].cards }))
    gusa = gusaCheck(inputs, cfg)
    hands = rankHands(inputs, cfg)
    if (gusa) {
      reason = 'redeal'
    } else {
      const tierOf = new Map(hands.map((h) => [h.seat, h.tier]))
      const levels = [...new Set(contenders.map((s) => state.players[s].committed))].sort((a, b) => a - b)
      let prev = 0
      levels.forEach((level, i) => {
        let amount = state.players.reduce(
          (sum, p) => sum + Math.min(p.committed, level) - Math.min(p.committed, prev),
          0,
        )
        if (i === 0) amount += state.carryPot
        if (i === levels.length - 1) {
          amount += state.players.reduce((sum, p) => sum + p.committed - Math.min(p.committed, level), 0)
        }
        const eligible = contenders.filter((s) => state.players[s].committed >= level)
        const best = Math.max(...eligible.map((s) => tierOf.get(s)!))
        const sliceWinners = eligible.filter((s) => tierOf.get(s) === best)
        splitAmong(state, awards, amount, sliceWinners)
        for (const s of sliceWinners) if (!winners.includes(s)) winners.push(s)
        prev = level
      })
      winners.sort((a, b) => a - b)
    }
  }

  state.lastDeal = {
    dealIndex: state.dealIndex,
    reason,
    hands: hands.map((h) => ({ ...h, cards: [...state.players[h.seat].cards] })),
    awards,
    pot,
    winners,
    gusa,
  }

  for (const p of state.players) p.committed = 0
  if (reason === 'redeal') {
    state.carryPot = pot
  } else {
    state.carryPot = 0
    state.players.forEach((p, seat) => {
      p.stack += awards[seat]
    })
    state.dealsPlayed += 1
    for (const p of state.players) {
      if (inDeal(p) && p.stack === 0) p.out = true
    }
  }
  for (const p of state.players) {
    if (p.leaving) p.out = true
  }
  state.dealer = reason === 'redeal' ? nextActiveFrom(state, state.dealer) : nextActiveFrom(state, state.dealer + 1)
  state.currentBet = 0
  state.lastRaise = 0
  state.raises = 0
  state.seatToAct = null
  state.phase = 'betweenDeals'

  const sessionDone =
    activeCount(state) < 2 ||
    (reason !== 'redeal' && cfg.maxDeals > 0 && state.dealsPlayed >= cfg.maxDeals)
  if (sessionDone) finishSession(state)
}

/** Even split; the remainder goes to the first winner clockwise from the dealer. */
function splitAmong(state: GameState, awards: number[], amount: number, seats: Seat[]): void {
  if (seats.length === 0 || amount === 0) return
  const share = Math.floor(amount / seats.length)
  let remainder = amount - share * seats.length
  for (const s of seats) awards[s] += share
  const n = state.players.length
  for (let k = 1; k <= n && remainder > 0; k++) {
    const seat = (state.dealer + k) % n
    if (seats.includes(seat)) {
      awards[seat] += remainder
      remainder = 0
    }
  }
}

/** Session end: leavers go out, any stranded carry is split, payouts = stack − buyIn. */
export function finishSession(state: GameState): void {
  for (const p of state.players) {
    if (p.leaving) p.out = true
  }
  if (state.carryPot > 0) {
    const seated = state.players.flatMap((p, seat) => (p.out ? [] : [seat]))
    const awards = new Array<number>(state.players.length).fill(0)
    splitAmong(state, awards, state.carryPot, seated.length ? seated : state.players.map((_, s) => s))
    state.players.forEach((p, seat) => {
      p.stack += awards[seat]
    })
    state.carryPot = 0
  }
  state.phase = 'over'
  state.seatToAct = null
  state.result = {
    payouts: state.players.map((p) => p.stack - state.config.buyIn),
    dealsPlayed: state.dealsPlayed,
  }
}
