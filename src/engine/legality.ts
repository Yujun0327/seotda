import { HOST_SEAT } from './types'
import type { GameState, Move, PlayerState, Seat } from './types'

/** The pot is derived: everything committed this deal plus any 구사 carry. */
export function potOf(state: GameState): number {
  return state.carryPot + state.players.reduce((sum, p) => sum + p.committed, 0)
}

/** Dealt into the current deal (out seats hold no cards). */
export function inDeal(p: PlayerState): boolean {
  return p.cards.length === 2
}

/** Still contesting the pot. */
export function contending(p: PlayerState): boolean {
  return inDeal(p) && !p.folded
}

/** Contesting and still able to bet. */
export function live(p: PlayerState): boolean {
  return contending(p) && !p.allIn
}

/** Seated for future deals. */
export function active(p: PlayerState): boolean {
  return !p.out && !p.leaving
}

export interface BetAmounts {
  /** Chips owed to match `currentBet`. */
  toCall: number
  /** Raise increments (on top of `toCall`) for each raising move. */
  bing: number
  ddadang: number
  half: number
}

/** The chip amounts behind each betting move for `seat` in the current deal. */
export function betAmounts(state: GameState, seat: Seat): BetAmounts {
  const p = state.players[seat]
  const toCall = Math.max(0, state.currentBet - p.committed)
  return {
    toCall,
    bing: state.config.ante,
    ddadang: 2 * state.lastRaise,
    half: Math.floor((potOf(state) + toCall) / 2),
  }
}

/**
 * Every legal move for `seat` — drives the playout tests and the UI's
 * action bar. `leave` is the one move that is legal out of turn.
 */
export function legalMoves(state: GameState, seat: Seat): Move[] {
  const p = state.players[seat]
  if (!p || state.phase === 'over' || state.result) return []
  const moves: Move[] = []

  if (state.phase === 'betweenDeals') {
    if (seat === state.dealer && active(p)) moves.push({ type: 'nextDeal' })
    if (seat === HOST_SEAT) moves.push({ type: 'closeTable' })
    if (active(p)) moves.push({ type: 'leave' })
    return moves
  }

  // betting
  if (active(p)) moves.push({ type: 'leave' })
  if (seat !== state.seatToAct) return moves

  const { toCall, bing, ddadang, half } = betAmounts(state, seat)
  const canRaise = state.raises < state.config.maxRaises
  moves.push({ type: 'fold' })
  if (toCall <= p.stack) moves.push({ type: 'call' })
  if (canRaise && state.raises === 0 && bing >= state.lastRaise && p.stack >= toCall + bing) {
    moves.push({ type: 'bing' })
  }
  if (canRaise && state.raises > 0 && p.stack >= toCall + ddadang) moves.push({ type: 'ddadang' })
  if (canRaise && half >= state.lastRaise && p.stack >= toCall + half) moves.push({ type: 'half' })
  if (p.stack > 0) moves.push({ type: 'allin' })
  return moves
}

/** First seat clockwise after `from` that still has to act, or null. */
export function nextNeedingAction(state: GameState, from: number): Seat | null {
  const n = state.players.length
  for (let k = 1; k <= n; k++) {
    const seat = (from + k) % n
    const p = state.players[seat]
    if (live(p) && (!p.actedSinceRaise || p.committed < state.currentBet)) return seat
  }
  return null
}

/** First active seat at or after `from`, or `from` itself when none. */
export function nextActiveFrom(state: GameState, from: number): Seat {
  const n = state.players.length
  for (let k = 0; k < n; k++) {
    const seat = (from + k) % n
    if (active(state.players[seat])) return seat
  }
  return ((from % n) + n) % n
}
