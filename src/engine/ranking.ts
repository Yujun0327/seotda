import { cardOf, monthOf } from './cards'
import type { CardId } from './cards'
import type { GameConfig, Seat } from './types'

/**
 * Integer tiers (higher wins):
 *   38광땡 1000 > 암행어사 995 (context) > 18광땡 990 > 13광땡 980
 *   > 땡잡이 950 (context) > n땡 800+10n > 알리 700 > 독사 690 > 구삥 680
 *   > 장삥 670 > 장사 660 > 세륙 650 > k끗 10k (갑오 90 … 망통 0).
 * The two context specials only take their tier against the right opponents
 * (`rankHands`); on their own they are plain 0끗 / 1끗.
 */
export const TIER = {
  gwang38: 1000,
  amhaengeosa: 995,
  gwang18: 990,
  gwang13: 980,
  ddaengjabi: 950,
  ddaeng: (n: number) => 800 + 10 * n,
  alli: 700,
  doksa: 690,
  gubbing: 680,
  jangbbing: 670,
  jangsa: 660,
  seryuk: 650,
  kkeut: (k: number) => 10 * k,
} as const

export const GUSA_LABEL = '구사'
export const MUNG_GUSA_LABEL = '멍텅구리구사'

const DDAENG_NAMES = ['', '삥땡', '2땡', '3땡', '4땡', '5땡', '6땡', '7땡', '8땡', '9땡', '장땡']

export interface HandInput {
  seat: Seat
  cards: CardId[]
}

export interface RankedHand {
  seat: Seat
  tier: number
  label: string
}

function months(cards: readonly CardId[]): [number, number] {
  if (cards.length !== 2) throw new Error('a seotda hand is exactly two cards')
  const [a, b] = cards.map(monthOf)
  return a <= b ? [a, b] : [b, a]
}

function has(cards: readonly CardId[], id: CardId): boolean {
  return cards.includes(id)
}

/** Base tier of a hand on its own (context specials collapse to their 끗). */
export function baseTier(cards: readonly CardId[]): number {
  const [lo, hi] = months(cards)
  if (has(cards, 's03a') && has(cards, 's08a')) return TIER.gwang38
  if (has(cards, 's01a') && has(cards, 's08a')) return TIER.gwang18
  if (has(cards, 's01a') && has(cards, 's03a')) return TIER.gwang13
  if (lo === hi) return TIER.ddaeng(lo)
  if (lo === 1 && hi === 2) return TIER.alli
  if (lo === 1 && hi === 4) return TIER.doksa
  if (lo === 1 && hi === 9) return TIER.gubbing
  if (lo === 1 && hi === 10) return TIER.jangbbing
  if (lo === 4 && hi === 10) return TIER.jangsa
  if (lo === 4 && hi === 6) return TIER.seryuk
  return TIER.kkeut((lo + hi) % 10)
}

/** Korean label for a tier (including the context specials' tiers). */
export function labelOf(tier: number): string {
  switch (tier) {
    case TIER.gwang38:
      return '38광땡'
    case TIER.amhaengeosa:
      return '암행어사'
    case TIER.gwang18:
      return '18광땡'
    case TIER.gwang13:
      return '13광땡'
    case TIER.ddaengjabi:
      return '땡잡이'
    case TIER.alli:
      return '알리'
    case TIER.doksa:
      return '독사'
    case TIER.gubbing:
      return '구삥'
    case TIER.jangbbing:
      return '장삥'
    case TIER.jangsa:
      return '장사'
    case TIER.seryuk:
      return '세륙'
  }
  if (tier >= 810 && tier <= 900 && tier % 10 === 0) return DDAENG_NAMES[(tier - 800) / 10]
  if (tier === 90) return '갑오'
  if (tier === 0) return '망통'
  if (tier > 0 && tier < 90 && tier % 10 === 0) return `${tier / 10}끗`
  throw new Error(`no label for tier ${tier}`)
}

export function isDdaengjabi(cards: readonly CardId[]): boolean {
  const [lo, hi] = months(cards)
  return lo === 3 && hi === 7
}

export function isAmhaengeosa(cards: readonly CardId[]): boolean {
  const [lo, hi] = months(cards)
  return lo === 4 && hi === 7
}

export function isGusa(cards: readonly CardId[]): boolean {
  const [lo, hi] = months(cards)
  return lo === 4 && hi === 9
}

export function isMungGusa(cards: readonly CardId[]): boolean {
  return has(cards, 's04a') && has(cards, 's09a')
}

function isPlainDdaeng(tier: number): boolean {
  return tier >= TIER.ddaeng(1) && tier <= TIER.ddaeng(10)
}

/**
 * Rank every non-folded showdown hand, applying the context specials against
 * the *base* tiers of the other hands: 땡잡이 beats a non-광 땡 held by anyone
 * else, 암행어사 beats a 13광땡/18광땡 held by anyone else.
 */
export function rankHands(hands: readonly HandInput[], cfg: GameConfig): RankedHand[] {
  const base = hands.map((h) => baseTier(h.cards))
  return hands.map((h, i) => {
    const others = base.filter((_, j) => j !== i)
    let tier = base[i]
    if (cfg.rules.ddaengjabi && isDdaengjabi(h.cards) && others.some(isPlainDdaeng)) {
      tier = TIER.ddaengjabi
    } else if (
      cfg.rules.amhaengeosa &&
      isAmhaengeosa(h.cards) &&
      others.some((t) => t === TIER.gwang13 || t === TIER.gwang18)
    ) {
      tier = TIER.amhaengeosa
    }
    return { seat: h.seat, tier, label: labelOf(tier) }
  })
}

/**
 * The redeal check, run before a showdown: a 구사 whose best opponent holds
 * no 땡 (or a 멍텅구리구사 whose best opponent holds no 광땡) voids the deal.
 * Returns the first triggering hand in list order, or null.
 */
export function gusaCheck(
  hands: readonly HandInput[],
  cfg: GameConfig,
): { seat: Seat; label: string } | null {
  if (hands.length < 2) return null
  const base = hands.map((h) => baseTier(h.cards))
  for (let i = 0; i < hands.length; i++) {
    const cards = hands[i].cards
    if (!isGusa(cards)) continue
    const best = Math.max(...base.filter((_, j) => j !== i))
    if (cfg.rules.mungGusa && isMungGusa(cards) && best < TIER.gwang13) {
      return { seat: hands[i].seat, label: MUNG_GUSA_LABEL }
    }
    if (cfg.rules.gusa && best < TIER.ddaeng(1)) {
      return { seat: hands[i].seat, label: GUSA_LABEL }
    }
  }
  return null
}

/** Convenience for UI/tests: a lone hand's base tier and label. */
export function describeHand(cards: readonly CardId[]): { tier: number; label: string } {
  const tier = baseTier(cards)
  return { tier, label: labelOf(tier) }
}

/** Sanity guard used by setup/tests: both ids must be real, distinct cards. */
export function validHand(cards: readonly CardId[]): boolean {
  return cards.length === 2 && cards[0] !== cards[1] && cards.every((c) => !!cardOf(c))
}
