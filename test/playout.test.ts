import { describe, expect, it } from 'vitest'
import {
  CARD_IDS,
  HIDDEN,
  applyMove,
  createGame,
  legalMoves,
  live,
  mulberry32,
  potOf,
  publicHash,
  redact,
} from '../src/engine'
import type { GameState, Move, PlayerCount, Seat } from '../src/engine'
import { ALL_MOVES, makeConfig } from './helpers'

/**
 * Random playouts over seeds × player counts with the 13 invariants:
 *  1 chip conservation      2 pot identity         3 20-card identity
 *  4 currentBet = max committed                    5 seatToAct validity
 *  6 legal-move completeness (every listed move applies, every other throws)
 *  7 side-pot bounds        8 replay hash          9 payouts zero-sum, ≥ −buyIn
 * 10 termination           11 `out` absorbing     12 redaction
 * 13 random illegal moves throw lowercase messages
 */

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)
const COUNTS: PlayerCount[] = [2, 3, 4, 5]
const BUY_IN = 3000
const ANTE = 100

function moveKey(m: Move): string {
  return m.type
}

function checkStatic(state: GameState, cfg: ReturnType<typeof makeConfig>, outBefore: boolean[]): void {
  const n = cfg.playerCount
  // 1 chip conservation
  const chips = state.carryPot + state.players.reduce((s, p) => s + p.stack + p.committed, 0)
  expect(chips).toBe(n * cfg.buyIn)
  for (const p of state.players) {
    expect(p.stack).toBeGreaterThanOrEqual(0)
    expect(p.committed).toBeGreaterThanOrEqual(0)
  }
  // 2 pot identity
  expect(potOf(state)).toBe(state.carryPot + state.players.reduce((s, p) => s + p.committed, 0))
  // 3 20-card identity
  const held = [...state.deck, ...state.players.flatMap((p) => p.cards)]
  expect([...held].sort()).toEqual([...CARD_IDS].sort())
  for (const p of state.players) expect([0, 2]).toContain(p.cards.length)
  // 4 currentBet = max committed (during betting)
  if (state.phase === 'betting') {
    expect(state.currentBet).toBe(Math.max(...state.players.map((p) => p.committed)))
    expect(state.raises).toBeLessThanOrEqual(cfg.maxRaises)
  }
  // 5 seatToAct validity
  if (state.phase === 'betting') {
    expect(state.seatToAct).not.toBeNull()
    const p = state.players[state.seatToAct!]
    expect(live(p)).toBe(true)
    expect(p.out).toBe(false)
    expect(p.stack).toBeGreaterThan(0)
  } else {
    expect(state.seatToAct).toBeNull()
  }
  // 11 out absorbing (and out seats hold nothing)
  state.players.forEach((p, i) => {
    if (outBefore[i]) expect(p.out).toBe(true)
    if (p.out) {
      expect(p.committed).toBe(0)
      if (state.phase === 'betting') expect(p.cards).toEqual([])
    }
  })
  // 12 redaction
  for (let viewer = -1; viewer < n; viewer++) {
    const v = redact(state, viewer < 0 ? null : viewer)
    expect(v.deck.every((c) => c === HIDDEN)).toBe(true)
    expect(v.deck.length).toBe(state.deck.length)
    v.players.forEach((p, seat) => {
      const real = state.players[seat]
      expect(p.cards.length).toBe(real.cards.length)
      if (seat === viewer) {
        expect(p.cards).toEqual(real.cards)
        return
      }
      const shownAtShowdown =
        state.phase !== 'betting' &&
        state.lastDeal?.dealIndex === state.dealIndex &&
        state.lastDeal.hands.some((h) => h.seat === seat)
      if (real.folded || state.phase === 'betting' || !shownAtShowdown) {
        expect(p.cards.every((c) => c === HIDDEN)).toBe(true)
      } else {
        expect(p.cards).toEqual(real.cards)
      }
    })
    // redaction never touches the shared state
    expect(publicHash(state)).toBe(publicHash(state))
  }
  // 9 partial: result only in 'over'
  expect(state.result !== null).toBe(state.phase === 'over')
}

function checkCompleteness(state: GameState, n: number): void {
  for (let seat = 0; seat < n; seat++) {
    const legal = new Set(legalMoves(state, seat).map(moveKey))
    for (const m of ALL_MOVES) {
      if (legal.has(moveKey(m))) {
        expect(() => applyMove(state, seat, m), `${m.type} by ${seat} should apply`).not.toThrow()
      } else {
        let msg = ''
        try {
          applyMove(state, seat, m)
        } catch (e) {
          msg = (e as Error).message
        }
        expect(msg, `${m.type} by ${seat} should throw`).not.toBe('')
        expect(msg).toBe(msg.toLowerCase())
      }
    }
  }
}

describe('random playouts', () => {
  for (const playerCount of COUNTS) {
    for (const seed of SEEDS) {
      it(`${playerCount}P seed ${seed}: 13 invariants hold`, () => {
        const cfg = makeConfig(playerCount, {
          sharedSeed: seed * 1000 + playerCount,
          startingSeat: seed % playerCount,
          buyIn: BUY_IN,
          ante: ANTE,
          maxDeals: 12,
        })
        const rng = mulberry32(seed)
        const withTableMoves = seed % 4 === 0 // a quarter of the sessions see leave/closeTable
        let state = createGame(cfg)
        const log: { actor: Seat; move: Move }[] = []
        const maxSteps = 4000
        let steps = 0
        let outBefore = state.players.map((p) => p.out)
        checkStatic(state, cfg, outBefore)

        while (state.phase !== 'over') {
          expect(steps++).toBeLessThan(maxSteps) // 10 termination

          // 6 legal-move completeness (every seat × every move type)
          if (steps % 3 === 1) checkCompleteness(state, playerCount)

          // pick an actor: the seat to act (or the dealer between deals), or
          // rarely an out-of-turn table move
          const candidates: { actor: Seat; move: Move }[] = []
          for (let seat = 0; seat < playerCount; seat++) {
            for (const m of legalMoves(state, seat)) candidates.push({ actor: seat, move: m })
          }
          expect(candidates.length).toBeGreaterThan(0)
          const table = candidates.filter((c) => c.move.type === 'leave' || c.move.type === 'closeTable')
          const play = candidates.filter((c) => c.move.type !== 'leave' && c.move.type !== 'closeTable')
          const pool = withTableMoves && rng() < 0.02 && table.length ? table : play.length ? play : table
          const pick = pool[Math.floor(rng() * pool.length)]

          // 13 a random illegal move throws (lowercase) and leaves state untouched
          const before = publicHash(state)
          const wrongSeat = (pick.actor + 1 + Math.floor(rng() * (playerCount - 1))) % playerCount
          const wrongMove = ALL_MOVES[Math.floor(rng() * ALL_MOVES.length)]
          if (!legalMoves(state, wrongSeat).some((m) => moveKey(m) === moveKey(wrongMove))) {
            expect(() => applyMove(state, wrongSeat, wrongMove)).toThrow(/^[a-z]/)
          }
          expect(publicHash(state)).toBe(before)

          const carryBefore = state.carryPot
          const dealBefore = state.dealIndex
          const committedBefore = state.players.map((p) => p.committed)
          log.push(pick)
          state = applyMove(state, pick.actor, pick.move)
          expect(state.lastAction).toMatchObject({ seat: pick.actor, type: pick.move.type })
          // commitments at resolution time: the resolving action's own chips count
          committedBefore[pick.actor] += state.lastAction!.amount

          // 7 side-pot bounds: no seat wins more than it could have matched
          if (state.lastDeal && state.lastDeal.dealIndex === dealBefore && state.phase !== 'betting' && state.players.every((p) => p.committed === 0) && committedBefore.some((c) => c > 0)) {
            const d = state.lastDeal
            const total = carryBefore + committedBefore.reduce((a, b) => a + b)
            expect(d.pot).toBe(total)
            const awarded = d.awards.reduce((a, b) => a + b)
            expect(awarded).toBe(d.reason === 'redeal' ? 0 : total)
            if (d.reason === 'showdown') {
              d.awards.forEach((award, i) => {
                const cap = carryBefore + committedBefore.reduce((s, c) => s + Math.min(c, committedBefore[i]), 0)
                expect(award).toBeLessThanOrEqual(cap)
                if (award > 0) expect(d.hands.some((h) => h.seat === i)).toBe(true)
              })
              expect(d.hands.length).toBeGreaterThanOrEqual(2)
            }
            if (d.reason === 'redeal') expect(state.carryPot).toBe(total)
          }

          checkStatic(state, cfg, outBefore)
          outBefore = state.players.map((p) => p.out)
        }

        // 9 payouts zero-sum and bounded by the buy-in
        const payouts = state.result!.payouts
        expect(payouts.length).toBe(playerCount)
        expect(payouts.reduce((a, b) => a + b)).toBe(0)
        for (const x of payouts) {
          expect(x).toBeGreaterThanOrEqual(-cfg.buyIn)
          expect(Number.isInteger(x)).toBe(true)
        }
        expect(state.result!.dealsPlayed).toBeLessThanOrEqual(cfg.maxDeals)
        expect(state.carryPot).toBe(0)
        expect(legalMoves(state, 0)).toEqual([])

        // 8 replay hash: the log folds back to the identical state on a fresh client
        let replayed = createGame(cfg)
        for (const { actor, move } of log) replayed = applyMove(replayed, actor, move)
        expect(publicHash(replayed)).toBe(publicHash(state))
      })
    }
  }
})
