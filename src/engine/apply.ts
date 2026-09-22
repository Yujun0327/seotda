import { deepClone } from './clone'
import { active, betAmounts, contending, live, nextActiveFrom } from './legality'
import { activeCount, finishSession, settleTurn } from './resolve'
import { startDeal } from './setup'
import { HOST_SEAT } from './types'
import type { GameState, Move, MoveType, PlayerState, Seat } from './types'

/**
 * The single pure reducer. Throws on any illegal move; never mutates `prev`.
 * Every branch depends only on the state and the move itself, so all clients
 * fold the same move log into the identical state.
 */
export function applyMove(prev: GameState, actor: Seat, move: Move): GameState {
  if (prev.result || prev.phase === 'over') throw new Error('game is over')
  if (!prev.players[actor]) throw new Error('no such seat')

  const state = deepClone(prev)
  const p = state.players[actor]

  switch (move.type) {
    case 'leave': {
      if (p.out) throw new Error('already out')
      if (p.leaving) throw new Error('already leaving')
      p.leaving = true
      record(state, actor, 'leave', 0)
      if (state.phase === 'betweenDeals') {
        p.out = true
        if (state.dealer === actor) state.dealer = nextActiveFrom(state, actor + 1)
        if (activeCount(state) < 2) finishSession(state)
        return state
      }
      if (contending(p)) p.folded = true
      settleTurn(state, actor)
      return state
    }

    case 'closeTable': {
      if (actor !== HOST_SEAT) throw new Error('only the host can close the table')
      if (state.phase !== 'betweenDeals') throw new Error('table can only be closed between deals')
      record(state, actor, 'closeTable', 0)
      finishSession(state)
      return state
    }

    case 'nextDeal': {
      if (state.phase !== 'betweenDeals') throw new Error('a deal is in progress')
      if (actor !== state.dealer) throw new Error('only the dealer starts the deal')
      if (!active(p)) throw new Error('dealer has left')
      record(state, actor, 'nextDeal', 0)
      startDeal(state)
      return state
    }
  }

  // betting moves
  if (state.phase !== 'betting') throw new Error('not in a betting round')
  if (actor !== state.seatToAct) throw new Error('not your turn')
  const { toCall, bing, ddadang, half } = betAmounts(state, actor)
  const canRaise = state.raises < state.config.maxRaises

  switch (move.type) {
    case 'fold': {
      p.folded = true
      p.actedSinceRaise = true
      record(state, actor, 'fold', 0)
      break
    }
    case 'call': {
      if (toCall > p.stack) throw new Error('not enough chips to call')
      pay(p, toCall)
      p.actedSinceRaise = true
      record(state, actor, 'call', toCall)
      break
    }
    case 'bing': {
      if (!canRaise) throw new Error('raise cap reached')
      if (state.raises > 0) throw new Error('bing only opens the betting')
      if (bing < state.lastRaise) throw new Error('bing is below the minimum raise')
      if (p.stack < toCall + bing) throw new Error('not enough chips to bing')
      raise(state, actor, toCall, bing)
      record(state, actor, 'bing', toCall + bing)
      break
    }
    case 'ddadang': {
      if (!canRaise) throw new Error('raise cap reached')
      if (state.raises === 0) throw new Error('nothing to ddadang')
      if (p.stack < toCall + ddadang) throw new Error('not enough chips to ddadang')
      raise(state, actor, toCall, ddadang)
      record(state, actor, 'ddadang', toCall + ddadang)
      break
    }
    case 'half': {
      if (!canRaise) throw new Error('raise cap reached')
      if (half < state.lastRaise) throw new Error('half is below the minimum raise')
      if (p.stack < toCall + half) throw new Error('not enough chips to half')
      raise(state, actor, toCall, half)
      record(state, actor, 'half', toCall + half)
      break
    }
    case 'allin': {
      if (p.stack <= 0) throw new Error('no chips to push')
      const amount = p.stack
      pay(p, amount)
      p.actedSinceRaise = true
      if (p.committed > state.currentBet) {
        const increment = p.committed - state.currentBet
        state.currentBet = p.committed
        if (canRaise && increment >= state.lastRaise) {
          state.lastRaise = increment
          state.raises += 1
        }
        // an all-in that tops the bet always gives everyone else one more action
        reopen(state, actor)
      }
      record(state, actor, 'allin', amount)
      break
    }
    default:
      throw new Error('unknown move')
  }

  settleTurn(state, actor)
  return state
}

function record(state: GameState, seat: Seat, type: MoveType, amount: number): void {
  state.lastAction = { seat, type, amount }
}

function pay(p: PlayerState, amount: number): void {
  p.stack -= amount
  p.committed += amount
  if (p.stack === 0) p.allIn = true
}

function raise(state: GameState, actor: Seat, toCall: number, increment: number): void {
  const p = state.players[actor]
  pay(p, toCall + increment)
  state.currentBet = p.committed
  state.lastRaise = increment
  state.raises += 1
  p.actedSinceRaise = true
  reopen(state, actor)
}

/** Everyone else still able to bet owes an action again. */
function reopen(state: GameState, actor: Seat): void {
  state.players.forEach((q, seat) => {
    if (seat !== actor && live(q)) q.actedSinceRaise = false
  })
}
