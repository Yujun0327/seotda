<script lang="ts">
  import WalletBadge from './WalletBadge.svelte'
  import RulesLeaflet from './RulesLeaflet.svelte'
  import { loadPlayerName, savePlayerName } from '../app/persist'

  interface Props {
    onCreateRoom: () => void
    onJoinRoom: (code: string) => void
  }

  let { onCreateRoom, onJoinRoom }: Props = $props()

  let code = $state('')
  let rulesOpen = $state(false)
  let myName = $state(loadPlayerName())

  function rename(e: Event) {
    myName = (e.target as HTMLInputElement).value
    savePlayerName(myName)
  }
</script>

<main class="home">
  <header class="marquee">
    <p class="label kicker">뒷방 · 불 하나 · 패 두 장</p>
    <h1><span class="foil-text">섯다</span></h1>
    <p class="tag">삥, 따당, 하프, 올인 — 38광땡부터 망통까지</p>
  </header>
  <WalletBadge />

  <section class="panel block">
    <h2>자리 잡기</h2>
    <label class="field">
      <span class="label">내 이름</span>
      <input type="text" maxlength="14" value={myName} placeholder="이름" onchange={rename} />
    </label>
    <div class="row">
      <button class="btn btn--gold" onclick={onCreateRoom}>방 만들기</button>
      <form class="join" onsubmit={(e) => { e.preventDefault(); if (code.trim()) onJoinRoom(code.trim()) }}>
        <input type="text" maxlength="8" bind:value={code} placeholder="방 코드" aria-label="방 코드" />
        <button class="btn" type="submit" disabled={!code.trim()}>들어가기</button>
      </form>
    </div>
    <p class="hint">2~5명. 판돈은 방장이 정하고 시작할 때 지갑에서 걸립니다. 패는 서로 안 보이니 정정당당하게.</p>
    <div class="row">
      <button class="btn btn--quiet dark" onclick={() => (rulesOpen = true)}>족보와 규칙</button>
    </div>
  </section>

  <footer>
    <p>친구들끼리 노는 팬 게임 · 실제 돈은 오가지 않습니다</p>
    <p>build {__BUILD_STAMP__}</p>
  </footer>
</main>

{#if rulesOpen}
  <RulesLeaflet onClose={() => (rulesOpen = false)} />
{/if}

<style>
  .home { max-width: 40rem; margin: 0 auto; padding: 8vh var(--sp-4) var(--sp-7); display: flex; flex-direction: column; gap: var(--sp-5); }
  .marquee { text-align: center; }
  .kicker { color: var(--brass-hi); }
  h1 { font-size: clamp(3.6rem, 16vw, 6.4rem); line-height: 1; }
  .tag { margin: var(--sp-2) 0 0; color: var(--smoke); font-family: var(--font-body); }
  .block { padding: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-3); }
  .block h2 { font-size: var(--fs-lg); color: var(--ink); }
  .field { display: flex; flex-direction: column; gap: var(--sp-1); }
  .row { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
  .join { display: flex; gap: var(--sp-2); flex: 1; min-width: 12rem; }
  .join input { flex: 1; min-width: 0; text-transform: uppercase; letter-spacing: 0.12em; }
  .hint { margin: 0; color: var(--ink-soft); font-family: var(--font-body); }
  .dark { color: var(--ink); border-color: var(--line); }
  footer { text-align: center; color: var(--smoke); font-size: var(--fs-xs); }
  footer p { margin: var(--sp-1) 0; }
</style>
