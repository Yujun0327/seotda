<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import { OnlineSession } from '../app/session.svelte'
  import type { BaseSession } from '../app/session.svelte'
  import { dur, settle } from './motion'
  import PayoutLine from './PayoutLine.svelte'

  interface Props {
    session: BaseSession
    onRematch: () => void
    onExit: () => void
  }

  let { session, onRematch, onExit }: Props = $props()
  const online = $derived(session instanceof OnlineSession ? session : null)
  const gs = $derived(session.state)
  const r = $derived(gs.result!)
  const me = $derived(session.mySeat)
  const rows = $derived(r.payouts.map((p, seat) => ({ seat, p })).sort((a, b) => b.p - a.p))
  const fmt = (v: number) => (v > 0 ? '+' : '') + v.toLocaleString()
</script>

<div class="overlay" transition:fade={{ duration: dur(200) }}>
  <div class="card panel" transition:fly={{ y: 40, duration: dur(320), easing: settle }}>
    <p class="label">{r.dealsPlayed}판 정산</p>
    <h2 class:win={me !== null && r.payouts[me] > 0} class:lose={me !== null && r.payouts[me] < 0}>
      {me === null ? '테이블 닫힘' : r.payouts[me] > 0 ? '땄다!' : r.payouts[me] < 0 ? '잃었다…' : '본전'}
    </h2>
    <ol class="rows">
      {#each rows as row, i (row.seat)}
        <li style="--d:{i}" class:me={row.seat === me}>
          <span class="who">{gs.config.names[row.seat]}</span>
          <span class="stack tabular">{gs.players[row.seat].stack.toLocaleString()}</span>
          <span class="net tabular" class:plus={row.p > 0} class:minus={row.p < 0}>{fmt(row.p)}</span>
        </li>
      {/each}
    </ol>
    <PayoutLine payout={online?.payout ?? null} lock={online?.lockState ?? null} />
    <div class="actions">
      <button class="btn btn--gold" onclick={onRematch}>한 번 더</button>
      <button class="btn" onclick={onExit}>일어나기</button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgb(0 0 0 / 0.6); padding: var(--sp-4); }
  .card { width: min(94vw, 440px); padding: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-3); }
  h2 { font-size: var(--fs-2xl); color: var(--ink); }
  h2.win { color: var(--brass-lo); }
  h2.lose { color: var(--danger); }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .rows li { display: flex; gap: var(--sp-2); font-family: var(--font-body); animation: rise 300ms ease-out both; animation-delay: calc(var(--d) * 120ms); border-top: 1px solid var(--line); padding-top: 4px; }
  .rows li.me .who { color: var(--brass-lo); }
  .who { font-weight: 700; flex: 1; }
  .stack { color: var(--ink-soft); }
  .net { min-width: 6em; text-align: right; }
  .plus { color: #1f6f43; }
  .minus { color: var(--danger); }
  .actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-2); }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
</style>
