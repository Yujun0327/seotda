import { describe, expect, it } from 'vitest'
import { HIDDEN, applyMove, betAmounts, legalMoves, potOf, redact } from '../src/engine'
import type { GameState } from '../src/engine'
import { newGame, play, withHands, withStacks } from './helpers'

const types = (state: GameState, seat: number) => legalMoves(state, seat).map((m) => m.type)

function chips(state: GameState): number {
  return state.carryPot + state.players.reduce((s, p) => s + p.stack + p.committed, 0)
}

describe('deal start', () => {
  it('antes every seat, deals two cards each, seat after the dealer acts first', () => {
    const s = newGame(3)
    expect(s.phase).toBe('betting')
    expect(s.dealIndex).toBe(1)
    expect(s.dealer).toBe(0)
    expect(s.seatToAct).toBe(1)
    for (const p of s.players) {
      expect(p.stack).toBe(19500)
      expect(p.committed).toBe(500)
      expect(p.cards.length).toBe(2)
    }
    expect(s.deck.length).toBe(14)
    expect(s.currentBet).toBe(500)
    expect(potOf(s)).toBe(1500)
    expect(s.raises).toBe(0)
    expect(s.lastRaise).toBe(500)
  })

  it('unopened: check, bing, half, allin, fold (no ddadang)', () => {
    const s = newGame(2)
    expect(types(s, 1).sort()).toEqual(['allin', 'bing', 'call', 'fold', 'half', 'leave'].sort())
    expect(types(s, 0)).toEqual(['leave'])
    expect(betAmounts(s, 1)).toEqual({ toCall: 0, bing: 500, ddadang: 1000, half: 500 })
  })
})

describe('open / call / raise / cap', () => {
  it('bing opens, ddadang doubles, half is half the pot, then the cap leaves call/fold/allin', () => {
    let s = newGame(2) // dealer 0, seat 1 first
    s = applyMove(s, 1, { type: 'bing' })
    expect(s.players[1].committed).toBe(1000)
    expect(s.currentBet).toBe(1000)
    expect(s.raises).toBe(1)
    expect(s.lastRaise).toBe(500)
    expect(s.lastAction).toEqual({ seat: 1, type: 'bing', amount: 500 })
    expect(s.seatToAct).toBe(0)
    expect(types(s, 0)).not.toContain('bing')
    expect(betAmounts(s, 0)).toEqual({ toCall: 500, bing: 500, ddadang: 1000, half: 1000 })

    s = applyMove(s, 0, { type: 'ddadang' })
    expect(s.players[0].committed).toBe(2000)
    expect(s.currentBet).toBe(2000)
    expect(s.lastRaise).toBe(1000)
    expect(s.raises).toBe(2)
    expect(s.lastAction).toEqual({ seat: 0, type: 'ddadang', amount: 1500 })
    expect(s.seatToAct).toBe(1)

    // pot 3000 + toCall 1000 → half 2000
    expect(betAmounts(s, 1).half).toBe(2000)
    s = applyMove(s, 1, { type: 'half' })
    expect(s.players[1].committed).toBe(4000)
    expect(s.lastRaise).toBe(2000)
    expect(s.raises).toBe(3)
    expect(s.seatToAct).toBe(0)

    // cap reached
    expect(types(s, 0).sort()).toEqual(['allin', 'call', 'fold', 'leave'].sort())
    expect(() => applyMove(s, 0, { type: 'ddadang' })).toThrow('raise cap reached')
    expect(() => applyMove(s, 0, { type: 'half' })).toThrow('raise cap reached')

    s = applyMove(s, 0, { type: 'call' })
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.reason).toBe('showdown')
    expect(s.lastDeal!.pot).toBe(8000)
    expect(s.lastDeal!.hands.length).toBe(2)
    expect(s.lastDeal!.awards.reduce((a, b) => a + b)).toBe(8000)
    expect(chips(s)).toBe(40000)
    expect(s.dealer).toBe(1)
    expect(s.dealsPlayed).toBe(1)
  })

  it('check-check goes to showdown at ante level', () => {
    const s = play(newGame(2), [[1, 'call'], [0, 'call']])
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.pot).toBe(1000)
    expect(s.lastAction).toEqual({ seat: 0, type: 'call', amount: 0 })
  })

  it('rejects out-of-turn and out-of-phase moves with lowercase messages', () => {
    const s = newGame(2)
    expect(() => applyMove(s, 0, { type: 'call' })).toThrow('not your turn')
    expect(() => applyMove(s, 1, { type: 'ddadang' })).toThrow('nothing to ddadang')
    expect(() => applyMove(s, 0, { type: 'nextDeal' })).toThrow('a deal is in progress')
    expect(() => applyMove(s, 0, { type: 'closeTable' })).toThrow('table can only be closed between deals')
    expect(() => applyMove(s, 7, { type: 'call' })).toThrow('no such seat')
  })

  it('never mutates the previous state', () => {
    const s = newGame(2)
    const snapshot = JSON.stringify(s)
    applyMove(s, 1, { type: 'half' })
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})

describe('half min-raise rule', () => {
  it('half is ⌊(pot + toCall) / 2⌋ and must be at least the last raise', () => {
    let s = newGame(3)
    s = applyMove(s, 1, { type: 'half' }) // pot 1500 → 750
    expect(s.players[1].committed).toBe(1250)
    expect(s.lastRaise).toBe(750)
    expect(s.raises).toBe(1)
    // seat 2: pot 2250, toCall 750 → half 1500
    expect(betAmounts(s, 2).half).toBe(1500)
    // an artificially large last raise makes half illegal
    const pinned = { ...s, lastRaise: 5000 }
    expect(types(pinned, 2)).not.toContain('half')
    expect(() => applyMove(pinned, 2, { type: 'half' })).toThrow('half is below the minimum raise')
    expect(types(pinned, 2)).toContain('ddadang')
  })

  it('a raise needs the chips: short stacks lose half/ddadang and keep allin', () => {
    let s = withStacks(2, [20000, 1200]) // seat 1: 700 behind after ante
    s = applyMove(s, 1, { type: 'call' })
    s = applyMove(s, 0, { type: 'half' }) // 500 → seat 0 committed 1000
    expect(types(s, 1).sort()).toEqual(['allin', 'call', 'fold', 'leave'].sort())
    expect(() => applyMove(s, 1, { type: 'half' })).toThrow('not enough chips to half')
    expect(() => applyMove(s, 1, { type: 'ddadang' })).toThrow('not enough chips to ddadang')
  })
})

describe('all-in', () => {
  it('under-raise all-in tops the bet, reopens action, but is not a raise', () => {
    let s = withStacks(3, [20000, 20000, 1200]) // seat 2 has 700 behind
    s = applyMove(s, 1, { type: 'bing' }) // currentBet 1000, raises 1, lastRaise 500
    s = applyMove(s, 2, { type: 'allin' }) // committed 1200: +200 < 500
    expect(s.players[2].allIn).toBe(true)
    expect(s.players[2].stack).toBe(0)
    expect(s.currentBet).toBe(1200)
    expect(s.lastRaise).toBe(500)
    expect(s.raises).toBe(1)
    expect(s.lastAction).toEqual({ seat: 2, type: 'allin', amount: 700 })
    expect(s.seatToAct).toBe(0)
    expect(betAmounts(s, 0)).toMatchObject({ toCall: 700, ddadang: 1000 })
    s = applyMove(s, 0, { type: 'call' })
    // seat 1 owes 200 and gets to act again
    expect(s.seatToAct).toBe(1)
    expect(betAmounts(s, 1).toCall).toBe(200)
    s = applyMove(s, 1, { type: 'call' })
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.pot).toBe(3600)
    expect(chips(s)).toBe(41200)
  })

  it('a full-size all-in counts as a raise and can exceed the cap', () => {
    let s = withStacks(2, [20000, 3000])
    s = applyMove(s, 1, { type: 'allin' }) // +2500 ≥ 500 → raise
    expect(s.raises).toBe(1)
    expect(s.lastRaise).toBe(2500)
    expect(s.currentBet).toBe(3000)
    s = applyMove(s, 0, { type: 'call' })
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.pot).toBe(6000)
  })

  it('an all-in under the current bet ends the round without reopening', () => {
    let s = withStacks(3, [20000, 20000, 800])
    s = applyMove(s, 1, { type: 'half' }) // 750 → currentBet 1250
    s = applyMove(s, 2, { type: 'allin' }) // 300 more → committed 800 < 1250
    expect(s.seatToAct).toBe(0)
    s = applyMove(s, 0, { type: 'call' })
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.reason).toBe('showdown')
  })

  it('everyone all-in resolves at once', () => {
    let s = withStacks(2, [1000, 1000], { buyIn: 1000 })
    s = applyMove(s, 1, { type: 'allin' })
    s = applyMove(s, 0, { type: 'allin' })
    expect(s.phase).toBe('over') // one seat is broke
    expect(s.result!.payouts.reduce((a, b) => a + b)).toBe(0)
  })
})

describe('uncontested fold', () => {
  it('awards the pot without a showdown and keeps every hand hidden', () => {
    let s = newGame(2)
    s = applyMove(s, 1, { type: 'fold' })
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal).toMatchObject({ reason: 'uncontested', winners: [0], pot: 1000, hands: [] })
    expect(s.players[0].stack).toBe(20500)
    expect(s.players[1].stack).toBe(19500)
    const v = redact(s, 1)
    expect(v.players[0].cards).toEqual([HIDDEN, HIDDEN])
    expect(v.players[1].cards).toEqual(s.players[1].cards)
    expect(v.deck.every((c) => c === HIDDEN)).toBe(true)
  })

  it('in a 3-way the last remaining seat wins after two folds, and folded hands stay hidden at showdown', () => {
    let s = play(newGame(3), [[1, 'bing'], [2, 'fold'], [0, 'call']])
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.reason).toBe('showdown')
    expect(s.lastDeal!.hands.map((h) => h.seat)).toEqual([0, 1])
    const v = redact(s, null)
    expect(v.players[2].cards).toEqual([HIDDEN, HIDDEN])
    expect(v.players[0].cards).toEqual(s.players[0].cards)
    expect(v.players[1].cards).toEqual(s.players[1].cards)
  })
})

describe('side pots', () => {
  it('splits by committed level across three stack sizes', () => {
    let s = withStacks(3, [6000, 1000, 3000])
    s = withHands(s, { 0: ['s02a', 's08b'], 1: ['s03a', 's08a'], 2: ['s10a', 's10b'] })
    s = applyMove(s, 1, { type: 'allin' }) // 1000 total
    s = applyMove(s, 2, { type: 'allin' }) // 3000 total
    s = applyMove(s, 0, { type: 'call' }) // 3000
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.awards).toEqual([0, 3000, 4000])
    expect(s.lastDeal!.winners).toEqual([1, 2])
    expect(s.players.map((p) => p.stack)).toEqual([3000, 3000, 4000])
    expect(s.lastDeal!.hands.find((h) => h.seat === 1)!.label).toBe('38광땡')
    expect(chips(s)).toBe(10000)
  })

  it('folded chips flow into the slices', () => {
    let s = withStacks(3, [6000, 1000, 3000])
    s = withHands(s, { 0: ['s02a', 's08b'], 1: ['s03a', 's08a'], 2: ['s10a', 's10b'] })
    s = applyMove(s, 1, { type: 'allin' })
    s = applyMove(s, 2, { type: 'allin' })
    s = applyMove(s, 0, { type: 'fold' })
    // main pot 500 + 1000 + 1000 = 2500 (seat 0's ante included) to seat 1; seat 2's excess 2000 returns to seat 2
    expect(s.lastDeal!.awards).toEqual([0, 2500, 2000])
    expect(chips(s)).toBe(10000)
  })

  it('broke seats go out and the session ends when fewer than two remain', () => {
    let s = withStacks(2, [5000, 1000], { buyIn: 3000 })
    s = withHands(s, { 0: ['s10a', 's10b'], 1: ['s02a', 's08b'] })
    s = play(s, [[1, 'allin'], [0, 'call']])
    expect(s.players[1].out).toBe(true)
    expect(s.phase).toBe('over')
    expect(s.result).toEqual({ payouts: [3000, -3000], dealsPlayed: 1 })
  })
})

describe('ties', () => {
  it('splits evenly with the remainder to the first winner clockwise from the dealer', () => {
    let s = newGame(3, { ante: 501 })
    s = withHands(s, { 0: ['s05a', 's05b'], 1: ['s01a', 's02a'], 2: ['s01b', 's02b'] })
    s = play(s, [[1, 'call'], [2, 'call'], [0, 'fold']])
    expect(s.lastDeal!.pot).toBe(1503)
    expect(s.lastDeal!.awards).toEqual([0, 752, 751])
    expect(s.lastDeal!.winners).toEqual([1, 2])
    expect(s.lastDeal!.hands.map((h) => h.label)).toEqual(['알리', '알리'])
  })
})

describe('ante short stack', () => {
  it('a seat short of the ante is all-in from the ante and the deal resolves when no one can bet against them', () => {
    let s = withStacks(2, [20000, 300])
    // seat 1 all-in at 300; seat 0 alone and matched → immediate showdown
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal!.pot).toBe(800)
    expect(s.lastDeal!.reason).toBe('showdown')
    expect(chips(s)).toBe(20300)
  })

  it('a short-stacked seat in a 3-way still contests the main pot', () => {
    let s = withStacks(3, [20000, 20000, 300])
    expect(s.players[2].allIn).toBe(true)
    expect(s.currentBet).toBe(500)
    expect(s.seatToAct).toBe(1)
    s = withHands(s, { 0: ['s02a', 's08b'], 1: ['s03b', 's09b'], 2: ['s10a', 's10b'] })
    s = play(s, [[1, 'bing'], [0, 'call']])
    // levels 300 / 1000: main 900 to seat 2, side 1400 to seat 1
    expect(s.lastDeal!.awards).toEqual([0, 1400, 900])
    expect(chips(s)).toBe(40300)
  })
})

describe('구사 redeal', () => {
  it('carries the pot, keeps the dealer, and pays it out with the next deal', () => {
    let s = newGame(2)
    s = withHands(s, { 0: ['s04a', 's05a'], 1: ['s04b', 's09b'] })
    s = play(s, [[1, 'bing'], [0, 'call']])
    expect(s.phase).toBe('betweenDeals')
    expect(s.lastDeal).toMatchObject({ reason: 'redeal', gusa: { seat: 1, label: '구사' }, pot: 2000 })
    expect(s.carryPot).toBe(2000)
    expect(s.dealer).toBe(0)
    expect(s.dealsPlayed).toBe(0)
    expect(s.players.map((p) => p.stack)).toEqual([19000, 19000])
    s = applyMove(s, 0, { type: 'nextDeal' })
    expect(potOf(s)).toBe(3000)
    expect(s.dealIndex).toBe(2)
    s = withHands(s, { 0: ['s10a', 's10b'], 1: ['s02a', 's08b'] })
    s = play(s, [[1, 'call'], [0, 'call']])
    expect(s.lastDeal!.awards).toEqual([3000, 0])
    expect(s.carryPot).toBe(0)
    expect(s.dealsPlayed).toBe(1)
    expect(chips(s)).toBe(40000)
  })
})

describe('leave / closeTable', () => {
  it('leaving between deals removes the seat; a leaving dealer passes the button', () => {
    let s = play(newGame(3), [[1, 'call'], [2, 'call'], [0, 'call']])
    expect(s.dealer).toBe(1)
    s = applyMove(s, 1, { type: 'leave' })
    expect(s.players[1]).toMatchObject({ out: true, leaving: true })
    expect(s.dealer).toBe(2)
    expect(s.phase).toBe('betweenDeals')
    expect(types(s, 2)).toContain('nextDeal')
    expect(types(s, 1)).toEqual([])
    s = applyMove(s, 2, { type: 'nextDeal' })
    expect(s.players[1].cards).toEqual([])
    expect(s.players.filter((p) => p.cards.length === 2).length).toBe(2)
    expect(() => applyMove(s, 1, { type: 'leave' })).toThrow('already out')
  })

  it('leaving during betting folds the hand, even out of turn', () => {
    let s = newGame(3)
    s = applyMove(s, 0, { type: 'leave' })
    expect(s.players[0]).toMatchObject({ folded: true, leaving: true, out: false })
    expect(s.seatToAct).toBe(1)
    s = play(s, [[1, 'call'], [2, 'call']])
    expect(s.phase).toBe('betweenDeals')
    expect(s.players[0].out).toBe(true)
    expect(s.dealer).toBe(1)
  })

  it('leaving with one opponent ends the session with payouts', () => {
    let s = newGame(2)
    s = applyMove(s, 1, { type: 'leave' })
    expect(s.phase).toBe('over')
    expect(s.result!.payouts).toEqual([500, -500])
  })

  it('only the host closes the table, only between deals', () => {
    let s = play(newGame(2), [[1, 'call'], [0, 'call']])
    expect(() => applyMove(s, 1, { type: 'closeTable' })).toThrow('only the host can close the table')
    expect(types(s, 0)).toContain('closeTable')
    s = applyMove(s, 0, { type: 'closeTable' })
    expect(s.phase).toBe('over')
    expect(s.result!.dealsPlayed).toBe(1)
    expect(s.result!.payouts.reduce((a, b) => a + b)).toBe(0)
    expect(() => applyMove(s, 0, { type: 'nextDeal' })).toThrow('game is over')
  })

  it('maxDeals 0 runs until the host closes', () => {
    let s = newGame(2, { maxDeals: 0 })
    for (let i = 0; i < 20; i++) {
      s = play(s, [[s.seatToAct!, 'call'], [s.seatToAct === 0 ? 1 : 0, 'call']])
      expect(s.phase).toBe('betweenDeals')
      s = applyMove(s, s.dealer, { type: 'nextDeal' })
    }
    expect(s.dealIndex).toBe(21)
  })
})

describe('maxDeals', () => {
  it('ends the session after the configured number of resolved deals', () => {
    let s = newGame(2, { maxDeals: 2 })
    s = play(s, [[1, 'call'], [0, 'call']])
    expect(s.phase).toBe('betweenDeals')
    s = applyMove(s, 1, { type: 'nextDeal' })
    s = play(s, [[0, 'fold']])
    expect(s.phase).toBe('over')
    expect(s.result!.dealsPlayed).toBe(2)
    expect(s.result!.payouts.reduce((a, b) => a + b)).toBe(0)
    expect(s.seatToAct).toBeNull()
    expect(legalMoves(s, 0)).toEqual([])
  })
})
