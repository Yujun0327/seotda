import { applyMove, createGame, defaultConfig, describeHand, legalMoves, potOf, publicHash, redact } from '../engine'
import type { GameConfig, GameState, Move, PlayerCount, Seat } from '../engine'
import {
  BeaconSession,
  brokersFromEnv,
  type Beacon,
  type GameAdapter,
  type Transport,
} from '@yujun/game-net'
import { MONEY_RULES, WalletSession, defaultLedger, loadIdentity, type Identity, type Ledger, type LockState, type Payout } from '@yujun/game-net/wallet'
import { APP } from './persist'

export type SfxEvent = 'chips' | 'bet' | 'raise' | 'allin' | 'fold' | 'flip' | 'showdown' | 'deal' | 'win' | 'lose'

export const RULES_VERSION = '1'
const BUY_INS = MONEY_RULES.seotda?.table?.buyIns ?? [20000, 50000, 100000]
/** 삥 per buy-in tier. */
export function anteFor(buyIn: number): number {
  return Math.max(100, Math.round(buyIn / 40 / 50) * 50)
}

function seed32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/** Celebration tier for a showdown hand. */
export function handTier(tier: number): 1 | 2 | 3 | null {
  if (tier >= 980) return 3 // 광땡
  if (tier >= 810) return 2 // 땡
  if (tier >= 650 || tier === 90) return 1 // 알리…세륙, 갑오
  return null
}

export abstract class BaseSession {
  state = $state<GameState>() as GameState
  events = $state<{ id: number; sfx: SfxEvent }[]>([])
  private eventId = 0

  constructor(initial: GameState) {
    this.state = initial
  }

  abstract readonly mode: 'online'
  abstract get mySeat(): Seat | null
  abstract get viewer(): Seat | null

  get cfg(): GameConfig {
    return this.state.config
  }

  get names(): string[] {
    return this.state.config.names
  }

  get visibleState(): GameState {
    return redact(this.state, this.viewer)
  }

  get actor(): Seat | null {
    return this.state.seatToAct
  }

  get myTurn(): boolean {
    return !this.state.result && this.mySeat !== null && this.actor === this.mySeat
  }

  myMoves(): Move[] {
    if (this.mySeat === null || this.state.result) return []
    return legalMoves(this.state, this.mySeat)
  }

  get pot(): number {
    return potOf(this.state)
  }

  protected emit(sfx: SfxEvent) {
    this.events = [...this.events.slice(-5), { id: this.eventId++, sfx }]
  }

  protected applyLocal(actor: Seat, move: Move): void {
    const before = this.state
    const after = applyMove(before, actor, move)
    this.state = after
    this.emitFor(before, after, actor, move)
  }

  protected emitFor(before: GameState, after: GameState, actor: Seat, move: Move): void {
    void actor
    switch (move.type) {
      case 'fold':
        this.emit('fold')
        break
      case 'call':
        this.emit('chips')
        break
      case 'bing':
        this.emit('bet')
        break
      case 'ddadang':
      case 'half':
        this.emit('raise')
        break
      case 'allin':
        this.emit('allin')
        break
      case 'nextDeal':
        this.emit('deal')
        break
    }
    if (after.dealIndex > before.dealIndex && move.type !== 'nextDeal') this.emit('deal')
    if (after.lastDeal && after.lastDeal !== before.lastDeal && after.lastDeal.reason === 'showdown') this.emit('showdown')
    if (!before.result && after.result && this.mySeat !== null) {
      this.emit(after.result.payouts[this.mySeat] > 0 ? 'win' : 'lose')
    }
  }

  abstract submit(move: Move): void
  destroy(): void {}
}

/* ------------------------------------------------------------------ */

export type OnlineStatus = 'connecting' | 'lobby' | 'playing' | 'desync' | 'room-full' | 'version-mismatch'

export interface LobbySeat {
  playerKey: string
  name: string
  ready: boolean
  connected: boolean
}

interface Pick {
  buyIn: number
  maxDeals: number
}

function makeAdapter(host: () => OnlineSession | null): GameAdapter<GameConfig, GameState, Move> {
  return {
    app: APP,
    protocol: 1,
    rulesVersion: RULES_VERSION,
    minSeats: 2,
    maxSeats: 5,
    makeConfig: (players, prev) => {
      const n = Math.max(2, Math.min(5, players.length)) as PlayerCount
      const h = host()
      const buyIn = prev ? prev.buyIn : (h?.hostBuyIn ?? 0)
      const chips = buyIn > 0 ? buyIn : 20000
      return defaultConfig({
        playerCount: n,
        sharedSeed: seed32(),
        startingSeat: prev ? (prev.startingSeat + 1) % n : Math.floor(Math.random() * n),
        names: Array.from({ length: n }, (_, i) => players[i]?.name.trim() || `${i + 1}번`),
        rulesVersion: RULES_VERSION,
        buyIn: chips,
        ante: anteFor(chips),
        maxDeals: prev ? prev.maxDeals : (h?.hostMaxDeals ?? 12),
      })
    },
    create: (cfg) => ({ state: createGame(cfg) }),
    apply: applyMove,
    hash: publicHash,
    actor: (s) => s.seatToAct ?? s.dealer,
    isOver: (s) => s.result !== null,
    // between deals the dealer (not seatToAct) moves, and leave/closeTable are out of turn: ask the engine
    actorFor: (s, seat, move) => (legalMoves(s, seat).some((m) => m.type === move.type) ? seat : null),
    winners: (s) => (s.result ? s.result.payouts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0) : []),
    payouts: (s, cfg) => (s.result && cfg.buyIn === moneyBuyIn(cfg) ? s.result.payouts : s.result ? s.result.payouts.map(() => 0) : []),
    stake: (cfg) => moneyBuyIn(cfg),
  }
}

/** The locked stake: the buy-in when it is one of the money tiers, else 0 (free play). */
function moneyBuyIn(cfg: GameConfig): number {
  return BUY_INS.includes(cfg.buyIn) ? cfg.buyIn : 0
}

type Core = BeaconSession<GameConfig, GameState, Move>

export interface OnlineTestHooks {
  transport?: Transport<Beacon<GameConfig, Move>>
  now?: () => number
  timers?: boolean
  ledger?: Ledger
  identity?: Identity
}

export class OnlineSession extends BaseSession {
  readonly mode = 'online'
  readonly room: string
  readonly myKey: string
  balances = $state<Record<string, number>>({})

  private readonly core: Core
  private wallet: WalletSession<GameConfig, GameState, Move, undefined> | null = null
  private rev = $state(0)
  private gameId = ''
  private seenLog = 0
  private prev: GameState
  private pick = $state<Pick>({ buyIn: 0, maxDeals: 12 })
  private balanceKeys = ''

  constructor(room: string, creator: boolean, identity: { key: string; name: string }, test: OnlineTestHooks = {}) {
    const self: { s: OnlineSession | null } = { s: null }
    const core: Core = new BeaconSession(makeAdapter(() => self.s), {
      room,
      creator,
      identity,
      transport: test.transport,
      brokers: test.transport ? undefined : brokersFromEnv(import.meta.env as Record<string, string | undefined>),
      now: test.now,
      timers: test.timers,
      log: (t) => console.log(`[${APP}] ${t}`),
    })
    super(core.state)
    self.s = this
    this.core = core
    this.room = core.room
    this.myKey = core.myKey
    this.prev = core.state
    this.seenLog = core.logLength
    this.gameId = core.snapshot?.gameId ?? ''
    core.subscribe(() => this.sync())
    const ledger = test.ledger ?? (test.transport ? null : defaultLedger())
    if (ledger) {
      this.wallet = new WalletSession(core, APP, test.identity ?? loadIdentity(), ledger, test.now)
      this.wallet.subscribe(() => this.rev++)
    }
  }

  private get c(): Core {
    void this.rev
    return this.core
  }

  private sync(): void {
    const core = this.core
    if (core.snapshot && core.snapshot.gameId !== this.gameId) {
      this.gameId = core.snapshot.gameId
      this.seenLog = 0
      this.prev = createGame(core.snapshot.cfg)
    }
    this.state = core.state
    const log = core.snapshot?.log ?? []
    const fresh = log.length - this.seenLog
    if (fresh > 0 && fresh <= 2) {
      let st = this.prev
      for (const wire of log.slice(this.seenLog)) {
        const next = applyMove(st, wire.actor, wire.move)
        this.emitFor(st, next, wire.actor, wire.move)
        st = next
      }
    }
    this.seenLog = log.length
    this.prev = core.state
    if (!core.started) {
      if (!core.isHost) {
        const h = core.livePeers.find((p) => p.key === core.hostKey)
        const pick = (h?.extra as { pick?: Pick } | undefined)?.pick
        if (pick) this.pick = pick
      } else if (!core.extra) this.announcePick()
      this.refreshBalances()
    }
    this.rev++
  }

  get mySeat(): Seat | null {
    return this.c.seat
  }

  get viewer(): Seat | null {
    return this.c.seat
  }

  submit(move: Move): void {
    this.core.submit(move)
  }

  /** My hand's label (only meaningful during a deal). */
  get myHand(): { label: string; tier: number } | null {
    const seat = this.c.seat
    if (seat === null) return null
    const cards = this.state.players[seat]?.cards ?? []
    return cards.length === 2 ? describeHand(cards) : null
  }

  get status(): OnlineStatus {
    return this.c.status
  }

  get playing(): boolean {
    return this.c.playing
  }

  get spectator(): boolean {
    return this.c.spectator
  }

  get isHost(): boolean {
    return this.c.isHost
  }

  get hostKey(): string {
    return this.c.hostKey
  }

  get seat(): Seat | null {
    return this.c.seat
  }

  get seats(): LobbySeat[] {
    return this.c.players.map((p) => ({ playerKey: p.key, name: p.name, ready: p.ready, connected: p.connected }))
  }

  get canStart(): boolean {
    return this.c.canStart
  }

  get hostBuyIn(): number {
    void this.rev
    return this.pick.buyIn
  }

  set hostBuyIn(v: number) {
    this.pick = { ...this.pick, buyIn: v }
    this.announcePick()
  }

  get hostMaxDeals(): number {
    void this.rev
    return this.pick.maxDeals
  }

  set hostMaxDeals(v: number) {
    this.pick = { ...this.pick, maxDeals: v }
    this.announcePick()
  }

  get ante(): number {
    return anteFor(this.hostBuyIn > 0 ? this.hostBuyIn : 20000)
  }

  private announcePick(): void {
    if (this.core.isHost && !this.core.started) this.core.setExtra({ pick: $state.snapshot(this.pick) })
  }

  get canAfford(): boolean {
    if (!this.hostBuyIn || !this.wallet) return true
    const mine = this.balances[this.myKey]
    return mine === undefined ? true : mine >= this.hostBuyIn
  }

  private refreshBalances(): void {
    const ledger = this.ledger
    if (!ledger) return
    const keys = this.core.players.map((p) => p.key)
    const sig = keys.join(',')
    if (sig === this.balanceKeys) return
    this.balanceKeys = sig
    for (const key of keys) {
      void ledger.readPlayer(key).then((p) => {
        if (p) this.balances = { ...this.balances, [key]: p.balance }
      })
    }
  }

  setReady(ready: boolean): void {
    if (ready && !this.canAfford) return
    this.core.setReady(ready)
  }

  rename(name: string): void {
    this.core.setName(name)
  }

  startGame(): void {
    this.core.startGame()
  }

  requestRematch(): void {
    this.core.requestRematch()
  }

  get waitingOn(): string | null {
    const key = this.c.waitingOn
    if (!key || !this.core.snapshot) return null
    return this.cfg.names[this.core.snapshot.seats[key]] ?? this.core.nameOf(key)
  }

  relayCount(): number {
    return this.c.channelCount()
  }

  brokerCount(): number {
    return this.core.channels().length
  }

  rescan(): void {
    this.core.rescan()
  }

  get net(): Core {
    return this.core
  }

  get payout(): Payout | null {
    void this.rev
    return this.wallet?.payout ?? null
  }

  get lockState(): LockState | null {
    void this.rev
    return this.wallet?.lock ?? null
  }

  get ledger(): Ledger | null {
    return this.wallet ? (this.wallet as unknown as { ledger: Ledger }).ledger : null
  }

  leave(): void {
    this.wallet?.destroy()
    this.core.leave()
  }

  destroy(): void {
    this.wallet?.destroy()
    this.core.destroy()
  }
}
