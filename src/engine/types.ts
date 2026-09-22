import type { CardId } from './cards'

/** Seat index, 0..playerCount-1. Seat 0 is the host. */
export type Seat = number

export const HOST_SEAT: Seat = 0

export type PlayerCount = 2 | 3 | 4 | 5

/** Lobby toggles for the four context-dependent special hands. */
export interface RuleToggles {
  /** 구사 (4-9): redeal when no opponent holds a 땡. */
  gusa: boolean
  /** 멍텅구리구사 (4열끗+9열끗): redeal when no opponent holds a 광땡. */
  mungGusa: boolean
  /** 땡잡이 (3-7): beats any non-광 땡. */
  ddaengjabi: boolean
  /** 암행어사 (4-7): beats 13광땡 and 18광땡. */
  amhaengeosa: boolean
}

export interface GameConfig {
  playerCount: PlayerCount
  sharedSeed: number
  /** The first dealer (선). */
  startingSeat: Seat
  names: string[]
  rulesVersion: string
  /** Chips every seat brings to the table. */
  buyIn: number
  /** 삥 unit: the ante and the minimum bet. */
  ante: number
  /** Bets + raises allowed per deal (all-ins may still exceed the bet). */
  maxRaises: number
  /** Session length in resolved deals; 0 = until the host closes the table. */
  maxDeals: number
  rules: RuleToggles
}

export function defaultConfig(
  partial: Partial<GameConfig> & { playerCount: PlayerCount },
): GameConfig {
  const n = partial.playerCount
  return {
    sharedSeed: 1,
    startingSeat: 0,
    names: Array.from({ length: n }, (_, i) => `P${i}`),
    rulesVersion: '1',
    buyIn: 20000,
    ante: 500,
    maxRaises: 3,
    maxDeals: 12,
    ...partial,
    rules: { gusa: true, mungGusa: true, ddaengjabi: true, amhaengeosa: true, ...partial.rules },
  }
}

export interface PlayerState {
  stack: number
  /** Chips put into the current deal (ante included). */
  committed: number
  /** Two card ids while in a deal; `[]` when out of it. HIDDEN in redacted views. */
  cards: CardId[]
  folded: boolean
  allIn: boolean
  /** Left the table or went broke — absorbing. */
  out: boolean
  /** Asked to leave; becomes `out` when the current deal resolves. */
  leaving: boolean
  /** Has acted since the last bet/raise (round-end bookkeeping). */
  actedSinceRaise: boolean
}

export type Phase = 'betting' | 'betweenDeals' | 'over'

export type DealReason = 'showdown' | 'uncontested' | 'redeal'

export interface RevealedHand {
  seat: Seat
  cards: CardId[]
  tier: number
  label: string
}

/** Public recap of the last resolved deal. */
export interface DealResult {
  dealIndex: number
  reason: DealReason
  /** Showdown hands only — folded hands and an uncontested winner stay hidden. */
  hands: RevealedHand[]
  /** Chips awarded per seat. */
  awards: number[]
  /** Total pot at resolution (carried forward on a redeal). */
  pot: number
  winners: Seat[]
  /** The 구사 that forced the redeal. */
  gusa: { seat: Seat; label: string } | null
}

export type MoveType =
  | 'fold'
  | 'call'
  | 'bing'
  | 'ddadang'
  | 'half'
  | 'allin'
  | 'nextDeal'
  | 'leave'
  | 'closeTable'

export interface LastAction {
  seat: Seat
  type: MoveType
  /** Chips moved by the action (0 for check/fold/table moves). */
  amount: number
}

export interface GameState {
  config: GameConfig
  /** Serializable mulberry32 state; advanced by every deal's shuffle. */
  rngState: number
  /** Ordinal of the current deal (redeals included), 1-based. */
  dealIndex: number
  /** Deals resolved by showdown or fold (redeals excluded); drives `maxDeals`. */
  dealsPlayed: number
  dealer: Seat
  phase: Phase
  seatToAct: Seat | null
  players: PlayerState[]
  /** Undealt cards. Hidden in redacted views. */
  deck: CardId[]
  /** Pot carried over from a 구사 redeal. */
  carryPot: number
  /** Highest `committed` of the deal — what everyone must match. */
  currentBet: number
  /** Size of the last full bet/raise; the minimum for the next one. */
  lastRaise: number
  /** Bets/raises made this deal (capped by `maxRaises`). */
  raises: number
  lastDeal: DealResult | null
  lastAction: LastAction | null
  result: { payouts: number[]; dealsPlayed: number } | null
}

export type Move =
  /** 다이. */
  | { type: 'fold' }
  /** 콜 — a check when nothing is owed. */
  | { type: 'call' }
  /** 삥 — bet/raise one ante. */
  | { type: 'bing' }
  /** 따당 — raise 2 × lastRaise. */
  | { type: 'ddadang' }
  /** 하프 — raise ⌊(pot + toCall) / 2⌋. */
  | { type: 'half' }
  /** 올인 — push the whole stack. */
  | { type: 'allin' }
  /** Dealer starts the next deal. */
  | { type: 'nextDeal' }
  /** Leave the table (folds first if in a deal). */
  | { type: 'leave' }
  /** Host ends the session between deals. */
  | { type: 'closeTable' }
