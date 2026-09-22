import { describe, expect, it } from 'vitest'
import {
  CARDS,
  CARD_IDS,
  TIER,
  baseTier,
  cardOf,
  gusaCheck,
  labelOf,
  rankHands,
} from '../src/engine'
import type { CardId } from '../src/engine'
import { makeConfig } from './helpers'

const cfg = makeConfig(2)

/** Strictly descending order of hands (base tiers; specials via rankHands below). */
const ORDERED: [string, [CardId, CardId]][] = [
  ['38광땡', ['s03a', 's08a']],
  ['18광땡', ['s01a', 's08a']],
  ['13광땡', ['s01a', 's03a']],
  ['장땡', ['s10a', 's10b']],
  ['9땡', ['s09a', 's09b']],
  ['8땡', ['s08a', 's08b']],
  ['7땡', ['s07a', 's07b']],
  ['6땡', ['s06a', 's06b']],
  ['5땡', ['s05a', 's05b']],
  ['4땡', ['s04a', 's04b']],
  ['3땡', ['s03a', 's03b']],
  ['2땡', ['s02a', 's02b']],
  ['삥땡', ['s01a', 's01b']],
  ['알리', ['s01a', 's02a']],
  ['독사', ['s01b', 's04a']],
  ['구삥', ['s01a', 's09b']],
  ['장삥', ['s01b', 's10a']],
  ['장사', ['s04b', 's10a']],
  ['세륙', ['s04a', 's06b']],
  ['갑오', ['s04a', 's05a']],
  ['8끗', ['s03b', 's05a']],
  ['7끗', ['s02a', 's05b']],
  ['6끗', ['s02b', 's04b']],
  ['5끗', ['s02a', 's03b']],
  ['4끗', ['s06a', 's08b']],
  ['3끗', ['s04b', 's09a']],
  ['2끗', ['s03b', 's09b']],
  ['1끗', ['s05a', 's06b']],
  ['망통', ['s02a', 's08b']],
]

describe('cards', () => {
  it('has 20 unique ids s01a…s10b with the special kinds in slot a', () => {
    expect(CARD_IDS.length).toBe(20)
    expect(new Set(CARD_IDS).size).toBe(20)
    expect(CARD_IDS[0]).toBe('s01a')
    expect(CARD_IDS[19]).toBe('s10b')
    for (const m of [1, 3, 8]) expect(cardOf(`s0${m}a`).kind).toBe('bright')
    for (const m of [4, 9]) expect(cardOf(`s0${m}a`).kind).toBe('animal')
    expect(CARDS.filter((c) => c.kind === 'bright').length).toBe(3)
  })
})

describe('hand ranking', () => {
  it('orders the reference list of hands strictly', () => {
    expect(ORDERED.length).toBeGreaterThanOrEqual(29)
    const tiers = ORDERED.map(([label, cards]) => {
      const tier = baseTier(cards)
      expect(labelOf(tier), label).toBe(label)
      return tier
    })
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeLessThan(tiers[i - 1])
  })

  it('places the context specials in the full order (≥30 hands)', () => {
    const full: number[] = [
      TIER.gwang38,
      rankHands([{ seat: 0, cards: ['s04a', 's07a'] }, { seat: 1, cards: ['s01a', 's08a'] }], cfg)[0].tier,
      TIER.gwang18,
      TIER.gwang13,
      rankHands([{ seat: 0, cards: ['s03a', 's07a'] }, { seat: 1, cards: ['s09a', 's09b'] }], cfg)[0].tier,
      ...ORDERED.slice(3).map(([, cards]) => baseTier(cards)),
    ]
    expect(full.length).toBeGreaterThanOrEqual(30)
    for (let i = 1; i < full.length; i++) expect(full[i]).toBeLessThan(full[i - 1])
    expect(labelOf(full[1])).toBe('암행어사')
    expect(labelOf(full[4])).toBe('땡잡이')
  })

  it('labels all 190 two-card combinations', () => {
    let count = 0
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
      for (let j = i + 1; j < 20; j++) {
        const tier = baseTier([CARD_IDS[i], CARD_IDS[j]])
        const label = labelOf(tier)
        expect(label).toMatch(/\S/)
        seen.add(label)
        count++
        // order-independent
        expect(baseTier([CARD_IDS[j], CARD_IDS[i]])).toBe(tier)
      }
    }
    expect(count).toBe(190)
    for (const l of ['38광땡', '18광땡', '13광땡', '장땡', '삥땡', '알리', '독사', '구삥', '장삥', '장사', '세륙', '갑오', '망통', '1끗', '8끗']) {
      expect(seen.has(l), l).toBe(true)
    }
    // the context specials never appear on their own
    expect(seen.has('땡잡이')).toBe(false)
    expect(seen.has('암행어사')).toBe(false)
  })

  it('rejects hands that are not two cards', () => {
    expect(() => baseTier(['s01a'])).toThrow()
    expect(() => labelOf(123)).toThrow()
  })
})

describe('context specials', () => {
  const ddaengjabi: [CardId, CardId] = ['s03b', 's07a']
  const amhaengeosa: [CardId, CardId] = ['s04b', 's07b']

  it('땡잡이 beats 9땡', () => {
    const r = rankHands([{ seat: 0, cards: ddaengjabi }, { seat: 1, cards: ['s09a', 's09b'] }], cfg)
    expect(r[0].tier).toBeGreaterThan(r[1].tier)
    expect(r[0].label).toBe('땡잡이')
    expect(r[1].label).toBe('9땡')
  })

  it('땡잡이 loses to 장땡? no — beats every non-광 땡 including 장땡', () => {
    const r = rankHands([{ seat: 0, cards: ddaengjabi }, { seat: 1, cards: ['s10a', 's10b'] }], cfg)
    expect(r[0].tier).toBeGreaterThan(r[1].tier)
  })

  it('땡잡이 vs 알리 is just 망통', () => {
    const r = rankHands([{ seat: 0, cards: ddaengjabi }, { seat: 1, cards: ['s01a', 's02b'] }], cfg)
    expect(r[0].label).toBe('망통')
    expect(r[0].tier).toBeLessThan(r[1].tier)
  })

  it('땡잡이 vs 13광땡 stays 망통 (광땡 is not caught)', () => {
    const r = rankHands([{ seat: 0, cards: ddaengjabi }, { seat: 1, cards: ['s01a', 's03a'] }], cfg)
    expect(r[0].label).toBe('망통')
  })

  it('땡잡이 in a 3-way: beats the 9땡 but loses to the 38광땡', () => {
    const r = rankHands(
      [{ seat: 0, cards: ddaengjabi }, { seat: 1, cards: ['s09a', 's09b'] }, { seat: 2, cards: ['s03a', 's08a'] }],
      cfg,
    )
    expect(r[0].label).toBe('땡잡이')
    expect(r[0].tier).toBeGreaterThan(r[1].tier)
    expect(r[0].tier).toBeLessThan(r[2].tier)
  })

  it('암행어사 beats 18광땡', () => {
    const r = rankHands([{ seat: 0, cards: amhaengeosa }, { seat: 1, cards: ['s01a', 's08a'] }], cfg)
    expect(r[0].label).toBe('암행어사')
    expect(r[0].tier).toBeGreaterThan(r[1].tier)
  })

  it('암행어사 beats 13광땡', () => {
    const r = rankHands([{ seat: 0, cards: amhaengeosa }, { seat: 1, cards: ['s01a', 's03a'] }], cfg)
    expect(r[0].tier).toBeGreaterThan(r[1].tier)
  })

  it('암행어사 vs 38광땡 is just 1끗', () => {
    const r = rankHands([{ seat: 0, cards: amhaengeosa }, { seat: 1, cards: ['s03a', 's08a'] }], cfg)
    expect(r[0].label).toBe('1끗')
    expect(r[0].tier).toBeLessThan(r[1].tier)
  })

  it('암행어사 vs 9땡 is just 1끗', () => {
    const r = rankHands([{ seat: 0, cards: amhaengeosa }, { seat: 1, cards: ['s09a', 's09b'] }], cfg)
    expect(r[0].label).toBe('1끗')
  })

  it('toggles turn the specials off', () => {
    const off = makeConfig(2, { rules: { gusa: false, mungGusa: false, ddaengjabi: false, amhaengeosa: false } })
    expect(rankHands([{ seat: 0, cards: ddaengjabi }, { seat: 1, cards: ['s09a', 's09b'] }], off)[0].label).toBe('망통')
    expect(rankHands([{ seat: 0, cards: amhaengeosa }, { seat: 1, cards: ['s01a', 's08a'] }], off)[0].label).toBe('1끗')
    expect(gusaCheck([{ seat: 0, cards: ['s04b', 's09b'] }, { seat: 1, cards: ['s04a', 's05a'] }], off)).toBeNull()
    expect(gusaCheck([{ seat: 0, cards: ['s04a', 's09a'] }, { seat: 1, cards: ['s10a', 's10b'] }], off)).toBeNull()
  })
})

describe('구사 redeal check', () => {
  it('구사 vs 갑오 → redeal', () => {
    const g = gusaCheck([{ seat: 1, cards: ['s04b', 's09b'] }, { seat: 0, cards: ['s04a', 's05a'] }], cfg)
    expect(g).toEqual({ seat: 1, label: '구사' })
  })

  it('구사 vs 1땡 → no redeal (구사 is a 3끗)', () => {
    const hands = [{ seat: 0, cards: ['s04b', 's09b'] }, { seat: 1, cards: ['s01a', 's01b'] }]
    expect(gusaCheck(hands, cfg)).toBeNull()
    const r = rankHands(hands, cfg)
    expect(r[0].label).toBe('3끗')
    expect(r[0].tier).toBeLessThan(r[1].tier)
  })

  it('멍텅구리구사 vs 장땡 → redeal', () => {
    const g = gusaCheck([{ seat: 0, cards: ['s04a', 's09a'] }, { seat: 1, cards: ['s10a', 's10b'] }], cfg)
    expect(g).toEqual({ seat: 0, label: '멍텅구리구사' })
  })

  it('멍텅구리구사 vs 13광땡 → no redeal', () => {
    expect(gusaCheck([{ seat: 0, cards: ['s04a', 's09a'] }, { seat: 1, cards: ['s01a', 's03a'] }], cfg)).toBeNull()
  })

  it('a plain 구사 vs 장땡 → no redeal, but with mungGusa off the 4열+9열 pair is a plain 구사', () => {
    expect(gusaCheck([{ seat: 0, cards: ['s04b', 's09a'] }, { seat: 1, cards: ['s10a', 's10b'] }], cfg)).toBeNull()
    const noMung = makeConfig(2, { rules: { gusa: true, mungGusa: false, ddaengjabi: true, amhaengeosa: true } })
    expect(gusaCheck([{ seat: 0, cards: ['s04a', 's09a'] }, { seat: 1, cards: ['s10a', 's10b'] }], noMung)).toBeNull()
    expect(gusaCheck([{ seat: 0, cards: ['s04a', 's09a'] }, { seat: 1, cards: ['s04b', 's05a'] }], noMung)).toEqual({
      seat: 0,
      label: '구사',
    })
  })

  it('only the best non-folded opponent matters (3-way)', () => {
    const hands = [
      { seat: 0, cards: ['s04b', 's09b'] },
      { seat: 1, cards: ['s02a', 's03b'] },
      { seat: 2, cards: ['s05a', 's05b'] },
    ]
    expect(gusaCheck(hands, cfg)).toBeNull()
    expect(gusaCheck(hands.slice(0, 2), cfg)).not.toBeNull()
  })
})
