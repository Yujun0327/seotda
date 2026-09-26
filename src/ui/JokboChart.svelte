<script lang="ts">
  import HwatuCard from './HwatuCard.svelte'

  /** One row of the 족보: a name, the two cards, and an optional note. */
  interface Row {
    name: string
    cards: [string, string]
    note?: string
  }

  const months = Array.from({ length: 10 }, (_, i) => ({ month: i + 1, id: `s${String(i + 1).padStart(2, '0')}a` }))
  const s = (m: number, slot: 'a' | 'b') => `s${String(m).padStart(2, '0')}${slot}`

  const gwangddaeng: Row[] = [
    { name: '3·8 광땡', cards: [s(3, 'a'), s(8, 'a')], note: '최고' },
    { name: '1·8 광땡', cards: [s(1, 'a'), s(8, 'a')] },
    { name: '1·3 광땡', cards: [s(1, 'a'), s(3, 'a')] },
  ]
  const ddaeng: Row[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((m) => ({
    name: m === 10 ? '장땡' : m === 1 ? '삥땡(1땡)' : `${m}땡`,
    cards: [s(m, 'a'), s(m, 'b')],
  }))
  const specials: Row[] = [
    { name: '7·4 암행어사', cards: [s(7, 'b'), s(4, 'b')], note: '1·3, 1·8 광땡을 잡음 · 광땡이 없으면 1끗' },
    { name: '7·3 땡잡이', cards: [s(7, 'b'), s(3, 'b')], note: '땡을 잡음(광땡 제외) · 땡이 없으면 망통' },
    { name: '4·9 구사', cards: [s(4, 'b'), s(9, 'b')], note: '상대에 땡이 없으면 재경기' },
    { name: '멍텅구리구사', cards: [s(4, 'a'), s(9, 'a')], note: '4·9 열끗 · 광땡이 없으면 재경기' },
  ]
  const kkeut: Row[] = [
    { name: '알리', cards: [s(1, 'b'), s(2, 'b')], note: '1·2' },
    { name: '독사', cards: [s(1, 'b'), s(4, 'b')], note: '1·4' },
    { name: '구삥', cards: [s(1, 'b'), s(9, 'b')], note: '1·9' },
    { name: '장삥', cards: [s(1, 'b'), s(10, 'b')], note: '1·10' },
    { name: '장사', cards: [s(10, 'b'), s(4, 'b')], note: '10·4' },
    { name: '세륙', cards: [s(4, 'b'), s(6, 'b')], note: '4·6' },
  ]
  const kkeutNames = ['갑오(9끗)', '8끗', '7끗', '6끗', '5끗', '4끗', '3끗', '2끗', '1끗', '망통(0끗)']
</script>

<div class="jokbo">
  <section class="months">
    {#each months as m (m.month)}
      <div class="cell">
        <HwatuCard id={m.id} width="var(--jw)" flat />
        <span class="label">{m.month}월</span>
      </div>
    {/each}
  </section>

  <section class="tier">
    <h4>광땡</h4>
    {#each gwangddaeng as r (r.name)}
      <div class="row">
        <div class="pair"><HwatuCard id={r.cards[0]} width="var(--jw)" flat /><HwatuCard id={r.cards[1]} width="var(--jw)" flat /></div>
        <span class="name">{r.name}</span>
        {#if r.note}<span class="note">{r.note}</span>{/if}
      </div>
    {/each}
  </section>

  <section class="tier two">
    <div>
      <h4>땡</h4>
      {#each ddaeng as r (r.name)}
        <div class="row">
          <div class="pair"><HwatuCard id={r.cards[0]} width="var(--jw)" flat /><HwatuCard id={r.cards[1]} width="var(--jw)" flat /></div>
          <span class="name">{r.name}</span>
        </div>
      {/each}
    </div>
    <div>
      <h4>특수패</h4>
      {#each specials as r (r.name)}
        <div class="row stacked">
          <div class="pair"><HwatuCard id={r.cards[0]} width="var(--jw)" flat /><HwatuCard id={r.cards[1]} width="var(--jw)" flat /></div>
          <span class="name">{r.name}</span>
          <span class="note">{r.note}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="tier two">
    <div>
      <h4>끗 위의 족보</h4>
      {#each kkeut as r (r.name)}
        <div class="row">
          <div class="pair"><HwatuCard id={r.cards[0]} width="var(--jw)" flat /><HwatuCard id={r.cards[1]} width="var(--jw)" flat /></div>
          <span class="name">{r.name}</span>
          <span class="note">{r.note}</span>
        </div>
      {/each}
    </div>
    <div>
      <h4>끗</h4>
      <p class="note">두 패의 월을 더한 값의 일의 자리</p>
      <ol class="kkeut">
        {#each kkeutNames as k (k)}<li>{k}</li>{/each}
      </ol>
    </div>
  </section>
</div>

<style>
  .jokbo { --jw: 30px; display: flex; flex-direction: column; gap: var(--sp-3); }
  .months { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--sp-2) var(--sp-1); }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .cell .label { font-size: 0.7rem; }
  .tier { border-top: 1px solid var(--line); padding-top: var(--sp-2); }
  .tier.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
  h4 { margin: 0 0 var(--sp-1); font-family: var(--font-display); font-size: var(--fs-sm); color: var(--brass-lo); }
  .row { display: flex; align-items: center; gap: var(--sp-2); padding: 3px 0; }
  .row.stacked { flex-wrap: wrap; }
  .row.stacked .note { flex-basis: 100%; }
  .pair { display: flex; gap: 2px; flex: none; }
  .name { font-weight: 700; font-size: var(--fs-xs); white-space: nowrap; }
  .note { font-size: 0.72rem; color: var(--ink-soft); font-family: var(--font-body); }
  .kkeut { margin: var(--sp-1) 0 0; padding-left: 1.2em; font-size: var(--fs-xs); line-height: 1.7; }
  @media (max-width: 380px) { .tier.two { grid-template-columns: 1fr; } }
</style>
