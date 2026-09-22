import { CARD_IDS, applyMove, createGame, defaultConfig } from '../src/engine'
import type { CardId, GameConfig, GameState, Move, PlayerCount, Seat } from '../src/engine'

export function makeConfig(playerCount: PlayerCount, overrides: Partial<GameConfig> = {}): GameConfig {
  return defaultConfig({
    playerCount,
    sharedSeed: 42,
    startingSeat: 0,
    buyIn: 20000,
    ante: 500,
    ...overrides,
  })
}

export function newGame(playerCount: PlayerCount, overrides: Partial<GameConfig> = {}): GameState {
  return createGame(makeConfig(playerCount, overrides))
}

/**
 * Test fixture: overwrite the dealt hands (the deck becomes the leftover
 * cards so the 20-card identity still holds). Betting-round bookkeeping is
 * untouched — call it right after a deal starts.
 */
export function withHands(state: GameState, hands: Record<Seat, [CardId, CardId]>): GameState {
  const next = structuredClone(state)
  const used = new Set<CardId>()
  for (const [seat, cards] of Object.entries(hands)) {
    next.players[Number(seat)].cards = [...cards]
    cards.forEach((c) => used.add(c))
  }
  next.players.forEach((p, seat) => {
    if (!(seat in hands)) p.cards.forEach((c) => used.add(c))
  })
  next.deck = CARD_IDS.filter((c) => !used.has(c))
  return next
}

/** Test fixture: a game whose seats sit down with different stacks (dealer 0, deal 1 just dealt). */
export function withStacks(playerCount: PlayerCount, stacks: number[], overrides: Partial<GameConfig> = {}): GameState {
  const cfg = makeConfig(playerCount, overrides)
  // rewind the first deal that createGame starts, set the stacks, deal again
  const state = structuredClone(createGame(cfg))
  state.phase = 'betweenDeals'
  state.dealIndex = 0
  state.rngState = cfg.sharedSeed >>> 0
  state.seatToAct = null
  state.currentBet = 0
  state.lastRaise = 0
  state.deck = []
  state.players.forEach((p, i) => {
    p.stack = stacks[i]
    p.committed = 0
    p.cards = []
    p.allIn = false
    p.folded = false
    p.actedSinceRaise = true
  })
  return applyMove(state, state.dealer, { type: 'nextDeal' })
}

export function play(state: GameState, steps: [Seat, Move['type']][]): GameState {
  let s = state
  for (const [seat, type] of steps) s = applyMove(s, seat, { type } as Move)
  return s
}

export const ALL_MOVES: Move[] = [
  { type: 'fold' },
  { type: 'call' },
  { type: 'bing' },
  { type: 'ddadang' },
  { type: 'half' },
  { type: 'allin' },
  { type: 'nextDeal' },
  { type: 'leave' },
  { type: 'closeTable' },
]
