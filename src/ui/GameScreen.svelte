<script lang="ts">
  import { fly, scale } from 'svelte/transition'
  import { betAmounts, potOf } from '../engine'
  import type { Move, Seat } from '../engine'
  import { OnlineSession, handTier } from '../app/session.svelte'
  import type { BaseSession } from '../app/session.svelte'
  import { celebrate, isMuted, play, setMuted, unlock } from './audio'
  import { dur, settle } from './motion'
  import Celebration from './Celebration.svelte'
  import HwatuCard from './HwatuCard.svelte'
  import ResultOverlay from './ResultOverlay.svelte'
  import RulesLeaflet from './RulesLeaflet.svelte'

  interface Props {
    session: BaseSession
    onExit: () => void
    onRematch: () => void
  }

  let { session, onExit, onRematch }: Props = $props()

  const online = $derived(session instanceof OnlineSession ? session : null)
  const gs = $derived(session.visibleState)
  const n = $derived(gs.config.playerCount)
  const me = $derived<Seat>(session.mySeat ?? 0)
  const spectator = $derived(session.mySeat === null)
  /** Seats drawn around the table starting from mine at the bottom, clockwise. */
  const order = $derived(Array.from({ length: n }, (_, i) => (me + i) % n))
  const moves = $derived(session.myMoves())
  const amounts = $derived(session.mySeat !== null && gs.phase === 'betting' ? betAmounts(gs, session.mySeat) : null)
  const pot = $derived(potOf(gs))
  const canAct = $derived(session.myTurn && gs.phase === 'betting')
  const has = (t: Move['type']) => moves.some((m) => m.type === t)

  let muted = $state(isMuted())
  let rulesOpen = $state(false)
  let confirmLeave = $state(false)
  let celebration = $state<{ tier: 1 | 2 | 3; title: string; kicker?: string } | null>(null)
  let revealKey = ''

  let seenEvent = -1
  $effect(() => {
    const last = session.events.at(-1)
    if (last && last.id > seenEvent) {
      seenEvent = last.id
      play(last.sfx)
    }
  })

  // showdown: celebrate the best hand once per resolved deal
  $effect(() => {
    const d = gs.lastDeal
    if (!d || d.reason !== 'showdown' || gs.phase !== 'betweenDeals') return
    const key = `${d.dealIndex}`
    if (key === revealKey) return
    revealKey = key
    const best = [...d.hands].sort((a, b) => b.tier - a.tier)[0]
    if (!best) return
    const t = handTier(best.tier)
    const mine = d.winners.includes(me) && !spectator
    if (t && (mine || t === 3)) {
      const delay = 420 + 220 * d.hands.length
      setTimeout(() => {
        celebration = { tier: t, title: best.label, kicker: mine ? '내 패' : `${gs.config.names[best.seat]}의 패` }
        celebrate(t)
      }, delay)
    }
  })

  function submit(move: Move) {
    unlock()
    try {
      session.submit(move)
    } catch {
      play('error')
    }
  }

  function leave() {
    if (!confirmLeave) {
      confirmLeave = true
      setTimeout(() => (confirmLeave = false), 4000)
      return
    }
    confirmLeave = false
    if (has('leave')) submit({ type: 'leave' })
    else onExit()
  }

  function toggleMute() {
    muted = !muted
    setMuted(muted)
  }

  const seatLabel = (seat: Seat) => {
    const p = gs.players[seat]
    if (p.out) return '나감'
    if (p.folded) return '다이'
    if (p.allIn) return '올인'
    return ''
  }

  /** A showdown hand from the deal that just ended — only between deals, never during the next one. */
  const revealed = (seat: Seat) => (gs.phase === 'betweenDeals' ? (gs.lastDeal?.hands.find((h) => h.seat === seat) ?? null) : null)
  const cardsFor = (seat: Seat): string[] => {
    const p = gs.players[seat]
    if (p.cards.length) return p.cards
    if (gs.phase === 'betweenDeals') return revealed(seat)?.cards ?? []
    return []
  }

  const fmt = (v: number) => v.toLocaleString()
  const turnLine = $derived.by(() => {
    if (gs.phase === 'over') return '테이블 정산'
    if (gs.phase === 'betweenDeals') {
      const d = gs.lastDeal
      if (!d) return ''
      if (d.reason === 'redeal') return `${d.gusa?.label ?? '구사'} — 다시 칩니다`
      const w = d.winners.map((s) => gs.config.names[s]).join(' · ')
      return d.reason === 'uncontested' ? `${w} 가져감` : `${w} 승`
    }
    if (gs.seatToAct === null) return '패 까기'
    return session.myTurn ? '내 차례' : `${gs.config.names[gs.seatToAct]} 차례`
  })
</script>

<div class="screen">
  <header class="topbar rail">
    <button class="btn btn--quiet exit" class:arm={confirmLeave} onclick={leave}>{confirmLeave ? '정말 나가기?' : '나가기'}</button>
    <button class="btn btn--quiet exit" onclick={toggleMute}>{muted ? '소리 꺼짐' : '소리'}</button>
    <button class="btn btn--quiet exit" onclick={() => (rulesOpen = true)}>족보</button>
    <div class="turn">
      <span class="turnline">{turnLine}</span>
      <span class="label">{gs.dealsPlayed}{gs.config.maxDeals ? `/${gs.config.maxDeals}` : ''}판{gs.config.maxDeals ? '' : ' · 무제한'} · 삥 {fmt(gs.config.ante)}</span>
    </div>
    {#if online?.isHost && has('closeTable')}
      <button class="btn btn--quiet exit" onclick={() => submit({ type: 'closeTable' })}>테이블 닫기</button>
    {/if}
  </header>

  {#if online?.status === 'desync'}
    <div class="notice">판이 어긋났습니다 — 다시 맞추는 중…</div>
  {:else if online?.waitingOn}
    <div class="notice">{online.waitingOn} 님을 기다리는 중…</div>
  {/if}

  <main class="table">
    <div class="felt">
      <div class="pot" aria-live="polite">
        <span class="label">판돈</span>
        <span class="amount tabular">{fmt(pot)}</span>
        {#if gs.carryPot}<span class="label">이월 {fmt(gs.carryPot)}</span>{/if}
      </div>

      {#each order as seat, idx (seat)}
        {@const p = gs.players[seat]}
        {@const rv = revealed(seat)}
        <div class="seat s{n}-{idx}" class:acting={gs.seatToAct === seat && gs.phase === 'betting'} class:folded={p.folded || p.out} class:winner={gs.lastDeal?.winners.includes(seat) && gs.phase === 'betweenDeals'} class:me={idx === 0}>
          <div class="cards" class:mine={idx === 0}>
            {#each cardsFor(seat) as id, ci (id + ci)}
              <div class="c" class:reveal={!!rv && idx !== 0} style="--ci:{ci}; --d:{(idx * 2 + ci) * 220}ms" in:scale={{ duration: dur(200), start: 0.8, easing: settle }}>
                <HwatuCard {id} width={idx === 0 ? 'var(--mw)' : 'var(--ow)'} flat />
              </div>
            {/each}
          </div>
          <div class="tag rail">
            {#if gs.dealer === seat}<span class="dealer">D</span>{/if}
            <span class="name">{gs.config.names[seat]}{idx === 0 && !spectator ? ' (나)' : ''}</span>
            <span class="stack tabular">{fmt(p.stack)}</span>
            {#if seatLabel(seat)}<span class="state">{seatLabel(seat)}</span>{/if}
            {#if rv}<span class="hand-label">{rv.label}</span>{:else if idx === 0 && gs.phase === 'betting' && online?.myHand}<span class="hand-label">{online.myHand.label}</span>{/if}
          </div>
          {#if p.committed > 0 && gs.phase === 'betting'}
            <div class="bet" in:fly={{ y: 20, duration: dur(300), easing: settle }}>
              <span class="chip"></span><span class="tabular">{fmt(p.committed)}</span>
            </div>
          {/if}
          {#if gs.lastDeal && gs.phase === 'betweenDeals' && gs.lastDeal.awards[seat] > 0}
            <div class="award" in:fly={{ y: -24, duration: dur(500), easing: settle }}>+{fmt(gs.lastDeal.awards[seat])}</div>
          {/if}
        </div>
      {/each}
    </div>
  </main>

  {#if canAct && amounts}
    <section class="actions rail" in:fly={{ y: 40, duration: dur(220), easing: settle }}>
      <button class="btn btn--danger" disabled={!has('fold')} onclick={() => submit({ type: 'fold' })}>다이</button>
      <button class="btn" disabled={!has('call')} onclick={() => submit({ type: 'call' })}>{amounts.toCall > 0 ? `콜 ${fmt(amounts.toCall)}` : '체크'}</button>
      <button class="btn" disabled={!has('bing')} onclick={() => submit({ type: 'bing' })}>삥 {fmt(amounts.bing)}</button>
      <button class="btn" disabled={!has('ddadang')} onclick={() => submit({ type: 'ddadang' })}>따당 {fmt(amounts.ddadang)}</button>
      <button class="btn" disabled={!has('half')} onclick={() => submit({ type: 'half' })}>하프 {fmt(amounts.half)}</button>
      <button class="btn btn--gold" disabled={!has('allin')} onclick={() => submit({ type: 'allin' })}>올인 {fmt(gs.players[me].stack)}</button>
    </section>
  {:else if gs.phase === 'betweenDeals' && !spectator}
    <section class="actions rail">
      {#if has('nextDeal')}
        <button class="btn btn--gold" onclick={() => submit({ type: 'nextDeal' })}>다음 판 돌리기</button>
      {:else}
        <span class="label">{gs.config.names[gs.dealer]} 님이 다음 판을 돌립니다</span>
      {/if}
    </section>
  {/if}

  {#if celebration}
    <Celebration tier={celebration.tier} title={celebration.title} kicker={celebration.kicker} onDone={() => (celebration = null)} />
  {/if}

  {#if gs.result}
    <ResultOverlay {session} {onRematch} {onExit} />
  {/if}

  {#if rulesOpen}
    <RulesLeaflet onClose={() => (rulesOpen = false)} />
  {/if}
</div>

<style>
  .screen {
    --mw: clamp(64px, 16vw, 110px);
    --ow: clamp(30px, 7vw, 46px);
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-2);
    padding-bottom: calc(var(--sp-3) + env(safe-area-inset-bottom));
  }
  .topbar { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-1) var(--sp-2); flex-wrap: wrap; }
  .exit { padding: 6px 10px; min-height: 34px; font-size: var(--fs-xs); }
  .exit.arm { color: var(--danger); border-color: var(--danger); }
  .turn { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .turnline { font-family: var(--font-display); font-size: var(--fs-md); }
  .notice { text-align: center; font-size: var(--fs-xs); color: var(--brass-hi); }

  .table { flex: 1; display: grid; justify-items: center; align-items: start; padding-top: var(--sp-3); }
  .felt {
    position: relative;
    width: min(96vw, 720px);
    aspect-ratio: 4 / 3;
    max-height: 70dvh;
    border-radius: 50% / 40%;
    background: radial-gradient(ellipse at 50% 40%, #8a2530, var(--felt-deep) 75%);
    box-shadow: inset 0 0 0 10px var(--mahogany), inset 0 0 0 12px var(--brass-lo), 0 20px 40px rgb(0 0 0 / 0.5);
  }
  .pot { position: absolute; left: 50%; top: 42%; translate: -50% -50%; text-align: center; display: flex; flex-direction: column; align-items: center; }
  .amount { font-family: var(--font-display); font-size: var(--fs-xl); color: var(--brass-hi); }

  .seat { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; translate: -50% -50%; transition: opacity 200ms ease; }
  .seat.folded { opacity: 0.45; }
  .seat.acting .tag { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 18px rgb(230 194 106 / 0.6); }
  .seat.winner .tag { box-shadow: 0 0 0 2px var(--brass-hi); }
  .tag { display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: var(--fs-xs); white-space: nowrap; }
  .dealer { background: var(--brass); color: var(--mahogany); border-radius: 50%; width: 18px; height: 18px; display: grid; place-items: center; font-weight: 700; font-size: 11px; }
  .name { font-weight: 700; }
  .stack { color: var(--brass-hi); }
  .state { color: var(--danger); }
  .hand-label { font-family: var(--font-display); color: var(--brass-hi); }
  .cards { display: flex; }
  .cards .c { margin-left: calc(var(--ci) * var(--ow) * -0.35); transform: rotate(calc((var(--ci) - 0.5) * 8deg)); }
  .cards.mine .c { margin-left: calc(var(--ci) * var(--mw) * -0.25); }
  .c.reveal { animation: flip 420ms ease-out both; animation-delay: var(--d); }
  @keyframes flip { 0% { transform: rotateY(90deg) scale(0.9); } 100% { transform: rotateY(0) scale(1); } }
  .bet { display: flex; align-items: center; gap: 4px; font-size: var(--fs-xs); color: var(--brass-hi); }
  .chip { width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, var(--brass-hi), var(--brass) 60%, var(--brass-lo)); box-shadow: 0 1px 0 rgb(0 0 0 / 0.5); }
  .award { position: absolute; top: -1.6em; font-family: var(--font-display); color: var(--brass-hi); font-size: var(--fs-md); }

  /* seat positions: index 0 is me at the bottom, then clockwise */
  .s2-0, .s3-0, .s4-0, .s5-0 { left: 50%; top: 88%; }
  .s2-1 { left: 50%; top: 14%; }
  .s3-1 { left: 18%; top: 28%; }
  .s3-2 { left: 82%; top: 28%; }
  .s4-1 { left: 14%; top: 50%; }
  .s4-2 { left: 50%; top: 12%; }
  .s4-3 { left: 86%; top: 50%; }
  .s5-1 { left: 14%; top: 60%; }
  .s5-2 { left: 26%; top: 16%; }
  .s5-3 { left: 74%; top: 16%; }
  .s5-4 { left: 86%; top: 60%; }

  .actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; justify-content: center; padding: var(--sp-2); align-items: center; }
  .actions .btn { padding: 10px 14px; }
</style>
