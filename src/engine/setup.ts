import { CARD_IDS } from './cards'
import { active, inDeal } from './legality'
import { settleTurn } from './resolve'
import { shuffleWithState } from './rng'
import type { GameConfig, GameState, PlayerState } from './types'

/**
 * Deterministic: the same config produces the identical state on every
 * client. Every deal's shuffle advances `rngState`, so the whole session
 * (deal after deal) replays from the move log — and hidden hands are an
 * honor system (README).
 */
export function createGame(cfg: GameConfig): GameState {
  if (cfg.playerCount < 2 || cfg.playerCount > 5) throw new Error('2 to 5 players')
  if (cfg.names.length !== cfg.playerCount) throw new Error('one name per seat')
  if (cfg.startingSeat < 0 || cfg.startingSeat >= cfg.playerCount) throw new Error('bad starting seat')
  if (!(cfg.buyIn > 0) || !(cfg.ante > 0) || cfg.ante > cfg.buyIn) throw new Error('bad stakes')

  const players: PlayerState[] = Array.from({ length: cfg.playerCount }, () => ({
    stack: cfg.buyIn,
    committed: 0,
    cards: [],
    folded: false,
    allIn: false,
    out: false,
    leaving: false,
    actedSinceRaise: true,
  }))

  const state: GameState = {
    config: cfg,
    rngState: cfg.sharedSeed >>> 0,
    dealIndex: 0,
    dealsPlayed: 0,
    dealer: cfg.startingSeat,
    phase: 'betweenDeals',
    seatToAct: null,
    players,
    deck: [],
    carryPot: 0,
    currentBet: 0,
    lastRaise: 0,
    raises: 0,
    lastDeal: null,
    lastAction: null,
    result: null,
  }
  startDeal(state)
  return state
}

/**
 * Mutates `state` in place (callers own a fresh clone): antes, shuffles with
 * the serializable rng, deals two cards to every active seat clockwise from
 * the dealer, and opens the betting round. Redeals reuse the same dealer.
 */
export function startDeal(state: GameState): void {
  const cfg = state.config
  const n = state.players.length
  for (const p of state.players) {
    if (p.leaving) p.out = true
  }

  const shuffled = shuffleWithState(CARD_IDS, state.rngState)
  state.rngState = shuffled.state
  const deck = shuffled.deck

  for (const p of state.players) {
    p.committed = 0
    p.cards = []
    p.folded = !active(p)
    p.allIn = false
    p.actedSinceRaise = !active(p)
    if (active(p)) {
      const ante = Math.min(cfg.ante, p.stack)
      p.stack -= ante
      p.committed = ante
      p.allIn = p.stack === 0
    }
  }
  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= n; k++) {
      const p = state.players[(state.dealer + k) % n]
      if (active(p)) p.cards.push(deck.pop()!)
    }
  }
  state.deck = deck

  state.dealIndex += 1
  state.currentBet = Math.max(0, ...state.players.filter(inDeal).map((p) => p.committed))
  state.lastRaise = cfg.ante
  state.raises = 0
  state.phase = 'betting'
  state.seatToAct = null
  settleTurn(state, state.dealer, true)
}
