/**
 * The 20-card Seotda deck: months 1–10, two cards each. Ids are `s<MM><slot>`
 * (`s01a` … `s10b`). Slot `a` carries the month's distinguished card where
 * it matters for the special hands: the 광 of months 1/3/8 (광땡) and the
 * 열끗 of months 4/9 (멍텅구리구사). For the other months slot `a` is the
 * 열끗/animal and slot `b` the 띠 — the kinds only matter for those specials.
 */
export type CardId = string

export type CardKind = 'bright' | 'animal' | 'ribbon'

export interface Card {
  id: CardId
  month: number
  slot: 'a' | 'b'
  kind: CardKind
  /** Korean display name, e.g. 삼광, 사열, 구띠. */
  name: string
}

/** Sentinel for cards stripped by `redact` — never a real card id. */
export const HIDDEN = 'xx'

const BRIGHT_MONTHS = new Set([1, 3, 8])
const MONTH_NAMES = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '장']

function kindOf(month: number, slot: 'a' | 'b'): CardKind {
  if (slot === 'a') return BRIGHT_MONTHS.has(month) ? 'bright' : 'animal'
  return month === 8 ? 'animal' : 'ribbon'
}

function nameOf(month: number, kind: CardKind): string {
  const suffix = kind === 'bright' ? '광' : kind === 'animal' ? '열' : '띠'
  return `${MONTH_NAMES[month]}${suffix}`
}

export const CARDS: readonly Card[] = Array.from({ length: 10 }, (_, i) => i + 1).flatMap((month) =>
  (['a', 'b'] as const).map((slot) => {
    const kind = kindOf(month, slot)
    return {
      id: `s${String(month).padStart(2, '0')}${slot}`,
      month,
      slot,
      kind,
      name: nameOf(month, kind),
    }
  }),
)

export const CARD_IDS: readonly CardId[] = CARDS.map((c) => c.id)

const BY_ID = new Map(CARDS.map((c) => [c.id, c]))

export function cardOf(id: CardId): Card {
  const card = BY_ID.get(id)
  if (!card) throw new Error(`unknown card ${id}`)
  return card
}

export function monthOf(id: CardId): number {
  return cardOf(id).month
}

export function isCardId(id: unknown): id is CardId {
  return typeof id === 'string' && BY_ID.has(id)
}
