import { describe, expect, it } from 'vitest'
import { CARD_IDS, mulberry32, rngStep, seededShuffle, shuffleWithState } from '../src/engine'

describe('serializable rng', () => {
  it('chaining rngStep from a seed reproduces mulberry32(seed)', () => {
    for (const seed of [0, 1, 42, 2 ** 31, 123456789]) {
      const rng = mulberry32(seed)
      let s = seed >>> 0
      for (let i = 0; i < 50; i++) {
        const step = rngStep(s)
        s = step.state
        expect(step.value).toBe(rng())
      }
    }
  })

  it('shuffleWithState chained from a seed equals seededShuffle with mulberry32(seed)', () => {
    for (const seed of [1, 7, 999]) {
      const rng = mulberry32(seed)
      let s = seed >>> 0
      for (let deal = 0; deal < 5; deal++) {
        const expected = seededShuffle(CARD_IDS, rng)
        const got = shuffleWithState(CARD_IDS, s)
        s = got.state
        expect(got.deck).toEqual(expected)
      }
    }
  })

  it('shuffleWithState returns a permutation and advances the state', () => {
    const { deck, state } = shuffleWithState(CARD_IDS, 5)
    expect([...deck].sort()).toEqual([...CARD_IDS].sort())
    expect(state).not.toBe(5)
    expect(deck).not.toEqual(CARD_IDS)
  })
})
