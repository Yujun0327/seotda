// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { Mesh } from '@yujun/game-net/mesh'
import { Ledger, identityFromSeed, verify, type Settlement } from '@yujun/game-net/wallet'
import { OnlineSession, anteFor } from '../src/app/session.svelte'
import { mulberry32, publicHash } from '../src/engine'
import type { Move } from '../src/engine'
import GameScreen from '../src/ui/GameScreen.svelte'
import PlayingProbe from './support/PlayingProbe.svelte'

if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    const anim = { cancel() {}, finish() {}, finished: Promise.resolve(), set onfinish(fn: (() => void) | null) { fn?.() } }
    return anim as unknown as Animation
  }
}

const ROOM = 'SDROOM'
let clock = 1_000_000
const now = () => clock
const ids = [1, 2, 3, 4].map((n) => identityFromSeed(new Uint8Array(32).fill(n)))

class FakeLedger extends Ledger {
  posts: { action: string; player: string; msg: string; sig: string }[] = []
  constructor() {
    super({ url: 'http://fake', anonKey: 'x' }, async (_input, init) => {
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { action: string; player: string; msg: string; sig: string }
        this.posts.push(body)
        if (body.action === 'settle') {
          if (!verify(body.player, 'settle', body.msg, body.sig)) return json({ ok: false, error: 'bad sig' }, 401)
          const s = JSON.parse(body.msg) as Settlement
          const signed = new Set(this.posts.filter((p) => p.action === 'settle' && JSON.parse(p.msg).gameId === s.gameId).map((p) => p.player))
          return json({ ok: true, status: signed.size === s.seats.length ? 'settled' : 'pending' })
        }
        return json({ ok: true, status: body.action === 'lock' ? 'locked' : 'ok' })
      }
      return json([])
    })
  }
}

class World {
  mesh = new Mesh<never>()
  sessions: OnlineSession[] = []
  ledger = new FakeLedger()

  add(i: number, creator = false, money = false): OnlineSession {
    const s = new OnlineSession(ROOM, creator, { key: money ? ids[i].id : `key-${i}`, name: `P${i}` }, {
      transport: this.mesh.peer(`peer-${i}`),
      now,
      timers: false,
      ...(money ? { ledger: this.ledger, identity: ids[i] } : {}),
    })
    this.sessions.push(s)
    return s
  }

  second(times = 1): void {
    for (let i = 0; i < times; i++) {
      clock += 1000
      for (const s of this.sessions) s.net.tick()
      this.mesh.flush()
    }
  }

  flush(): void {
    this.mesh.flush()
  }

  start(n: number, setup?: (host: OnlineSession) => void, money = false): OnlineSession[] {
    const host = this.add(0, true, money)
    for (let i = 1; i < n; i++) this.add(i, false, money)
    this.second(2)
    setup?.(host)
    this.flush()
    for (const s of this.sessions) s.setReady(true)
    this.flush()
    host.startGame()
    this.flush()
    return this.sessions
  }

  acting(): OnlineSession | undefined {
    return this.sessions.find((s) => s.myTurn)
  }
}

beforeEach(() => {
  localStorage.clear()
  clock = 1_000_000
})

/** Random session until the table closes (maxDeals) or everyone but one is broke. */
function playOut(w: World, seed: number, lossy = false) {
  const rng = mulberry32(seed)
  for (let step = 0; step < 3000 && !w.sessions[0].state.result; step++) {
    const st = w.sessions[0].state
    let mover: OnlineSession | undefined
    if (st.phase === 'betting') mover = w.acting()
    else if (st.phase === 'betweenDeals') mover = w.sessions.find((s) => s.myMoves().some((m) => m.type === 'nextDeal'))
    if (mover && !mover.state.result) {
      const moves = mover.myMoves().filter((m) => m.type !== 'leave' && m.type !== 'closeTable')
      expect(moves.length).toBeGreaterThan(0)
      mover.submit(moves[Math.floor(rng() * moves.length)] as Move)
    }
    if (lossy) w.mesh.filter = () => rng() > 0.4
    w.second()
  }
  w.mesh.filter = () => true
  w.second(4)
}

describe('lobby', () => {
  it("mirrors the host's buy-in and deal count; ante derives from the buy-in", () => {
    const w = new World()
    const [host, guest] = w.start(3, (h) => {
      h.hostBuyIn = 50000
      h.hostMaxDeals = 6
    })
    expect(guest.hostBuyIn).toBe(50000)
    expect(host.cfg.buyIn).toBe(50000)
    expect(host.cfg.ante).toBe(anteFor(50000))
    expect(guest.cfg.maxDeals).toBe(6)
    expect(publicHash(guest.state)).toBe(publicHash(host.state))
    expect(guest.state.players.every((p) => p.stack + p.committed === 50000)).toBe(true)
  })

  it('renders lobby→game reactively', () => {
    const w = new World()
    const host = w.add(0, true)
    const guest = w.add(1)
    w.second()
    const targets = [host, guest].map((session) => {
      const target = document.createElement('div')
      document.body.appendChild(target)
      return { target, instance: mount(PlayingProbe, { target, props: { session } }) }
    })
    flushSync()
    expect(targets.map((t) => t.target.textContent)).toEqual(['LOBBY', 'LOBBY'])
    host.setReady(true)
    guest.setReady(true)
    w.flush()
    host.startGame()
    w.flush()
    flushSync()
    expect(targets.map((t) => t.target.textContent)).toEqual(['GAME', 'GAME'])
    for (const t of targets) {
      unmount(t.instance)
      t.target.remove()
    }
  })
})

describe('play across the mesh', () => {
  it('3P: a 6-deal session ends in lockstep with zero-sum payouts', () => {
    const w = new World()
    const sessions = w.start(3, (h) => (h.hostMaxDeals = 6))
    playOut(w, 7)
    const ref = publicHash(sessions[0].state)
    for (const s of sessions) {
      expect(publicHash(s.state)).toBe(ref)
      expect(s.state.result).not.toBeNull()
    }
    expect(sessions[0].state.result!.payouts.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('4P: converges through 40% beacon loss', () => {
    const w = new World()
    const sessions = w.start(4, (h) => (h.hostMaxDeals = 4))
    playOut(w, 8, true)
    const ref = publicHash(sessions[0].state)
    for (const s of sessions) expect(publicHash(s.state)).toBe(ref)
  })

  it('hides other hands during betting and shows showdown hands after', () => {
    const w = new World()
    const [a, b] = w.start(2)
    const other = a.visibleState.players[b.mySeat!].cards
    expect(other).toEqual(['xx', 'xx'])
    expect(a.visibleState.players[a.mySeat!].cards.every((c) => c !== 'xx')).toBe(true)
    expect(a.visibleState.deck.every((c) => c === 'xx')).toBe(true)
  })

  it('a refreshed tab restores the session mid-deal', () => {
    const w = new World()
    const sessions = w.start(3)
    for (let i = 0; i < 2; i++) {
      const a = w.acting()
      if (a) a.submit(a.myMoves().find((m) => m.type === 'call') ?? a.myMoves()[0])
      w.second()
    }
    const gone = sessions[2]
    gone.destroy()
    w.sessions = sessions.slice(0, 2)
    const back = w.add(2)
    expect(back.playing).toBe(true)
    w.second(2)
    expect(publicHash(back.state)).toBe(publicHash(sessions[0].state))
  })
})

describe('money', () => {
  it('locks the buy-in and settles the session payouts on every seat', () => {
    const w = new World()
    const sessions = w.start(2, (h) => {
      h.hostBuyIn = 20000
      h.hostMaxDeals = 12
    }, true)
    playOut(w, 9)
    const r = sessions[0].state.result!
    expect(sessions[0].payout?.error).toBeUndefined()
    expect(sessions[0].net.logLength).toBeGreaterThanOrEqual(12)
    expect(r.payouts.reduce((a, b) => a + b, 0)).toBe(0)
    const locks = w.ledger.posts.filter((p) => p.action === 'lock')
    expect(new Set(locks.map((p) => p.player)).size).toBe(2)
    const settles = w.ledger.posts.filter((p) => p.action === 'settle')
    if (r.payouts.some((p) => p !== 0)) {
      expect(new Set(settles.map((p) => p.msg)).size).toBe(1)
      const s = JSON.parse(settles[0].msg) as Settlement
      expect(s.payouts).toEqual(r.payouts)
      expect(s.stake).toBe(20000)
    }
  })
})

describe('rendered table', () => {
  it('shows the action bar to the acting seat and applies a call by click', () => {
    const w = new World()
    const sessions = w.start(2)
    const acting = w.acting()!
    const other = sessions.find((s) => s !== acting)!
    const target = document.createElement('div')
    document.body.appendChild(target)
    const instance = mount(GameScreen, { target, props: { session: acting, onExit: () => {}, onRematch: () => {} } })
    flushSync()
    const buttons = [...target.querySelectorAll('.actions button')]
    expect(buttons.length).toBeGreaterThan(3)
    const call = buttons.find((b) => /^(콜|체크)/.test(b.textContent?.trim() ?? '')) as HTMLButtonElement
    expect(call.disabled).toBe(false)
    call.click()
    flushSync()
    w.flush()
    expect(acting.state.lastAction?.type).toBe('call')
    expect(publicHash(other.state)).toBe(publicHash(acting.state))
    unmount(instance)
    target.remove()
  })
})
