<script lang="ts">
  import Modal from './Modal.svelte'
  import JokboChart from './JokboChart.svelte'
  let { onClose }: { onClose: () => void } = $props()
</script>

<Modal {onClose}>
  <article class="rules">
    <h2>족보</h2>
    <p class="order">위에서 아래로, 왼쪽에서 오른쪽으로 높은 순입니다.</p>
    <JokboChart />
    <h3>판 진행</h3>
    <p>삥(기본)을 내고 두 장을 받습니다. 딜러 다음 사람부터: 다이 · 콜 · 삥(처음 올릴 때) · 따당(직전 올린 만큼 두 배) · 하프(판돈의 절반) · 올인. 올리기는 세 번까지. 모두 콜하면 패를 까고, 같은 족보면 나눕니다. 올인한 사람은 자기가 건 만큼까지만 가져갑니다.</p>
    <h3>돈</h3>
    <p>판돈(바이인)을 시작할 때 지갑에서 겁니다. 한 판에 강제로 나가는 건 삥(바이인의 1/40)뿐이고, 바이인 이상은 절대 잃지 않습니다. 방을 닫을 때 남은 칩만큼 정산합니다. 칩이 떨어지면 자리에서 빠집니다.</p>
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
  .order { color: var(--ink-soft); font-size: var(--fs-xs); }
  .en { color: var(--ink-soft); font-size: var(--fs-xs); font-family: var(--font-ui); }
  .btn { align-self: flex-start; margin-top: var(--sp-2); }
</style>
