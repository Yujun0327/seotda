<script lang="ts">
  import Modal from './Modal.svelte'
  let { onClose }: { onClose: () => void } = $props()
</script>

<Modal {onClose}>
  <article class="rules">
    <h2>족보</h2>
    <ol>
      <li>38광땡 (3월 광 + 8월 광)</li>
      <li>18광땡 · 13광땡</li>
      <li>장땡(10땡) → 9땡 … 1땡(삥땡)</li>
      <li>알리(1·2) · 독사(1·4) · 구삥(1·9) · 장삥(1·10) · 장사(4·10) · 세륙(4·6)</li>
      <li>갑오(9끗) → 8끗 … 1끗 → 망통(0끗)</li>
    </ol>
    <h3>특수패</h3>
    <ul>
      <li>땡잡이(3·7): 상대에게 땡이 있으면 이깁니다(광땡 제외). 없으면 0끗.</li>
      <li>암행어사(4·7): 13·18광땡을 잡습니다. 없으면 1끗.</li>
      <li>구사(4·9): 상대 최고패가 땡 미만이면 다시 칩니다. 멍텅구리구사(4·9 열끗)는 광땡 미만이면 재경기.</li>
    </ul>
    <h3>판 진행</h3>
    <p>삥(기본)을 내고 두 장을 받습니다. 딜러 다음 사람부터: 다이 · 콜 · 삥(처음 올릴 때) · 따당(직전 올린 만큼 두 배) · 하프(판돈의 절반) · 올인. 올리기는 세 번까지. 모두 콜하면 패를 까고, 같은 족보면 나눕니다. 올인한 사람은 자기가 건 만큼까지만 가져갑니다.</p>
    <h3>돈</h3>
    <p>판돈(바이인)을 시작할 때 지갑에서 겁니다. 방을 닫을 때 남은 칩만큼 정산합니다. 칩이 떨어지면 자리에서 빠집니다.</p>
    <p class="en">Seotda, the Korean two-card betting game. Ante, bet, fold or call; best hand takes the pot.</p>
    <button class="btn" onclick={onClose}>닫기</button>
  </article>
</Modal>

<style>
  .rules { color: var(--ink); font-family: var(--font-body); display: flex; flex-direction: column; gap: var(--sp-2); }
  h2 { font-size: var(--fs-xl); }
  h3 { font-size: var(--fs-md); margin-top: var(--sp-2); }
  p, ul, ol { margin: 0; }
  ul, ol { padding-left: 1.2em; }
  .en { color: var(--ink-soft); font-size: var(--fs-xs); font-family: var(--font-ui); }
  .btn { align-self: flex-start; margin-top: var(--sp-2); }
</style>
