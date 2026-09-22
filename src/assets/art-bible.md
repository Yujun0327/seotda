# 섯다 — art bible: "뒷방"

## Mood
The back room: a low table with red felt, a single hanging lamp, mahogany and brass, smoke in
the light. Quiet, tense, adult. Cards are small and precious; chips are heavy. NOT: neon
casino, purple, glassmorphism, emoji, Inter/Roboto.

## Surfaces
| token | hex | use |
|---|---|---|
| --felt | #6b1a1f | the table: page background |
| --felt-deep | #4a1015 | wells, empty seats, pot area |
| --mahogany | #2a1610 | rails, top bar, action bar |
| --ivory | #f0e6d2 | panels, sheets, card fields |
| --ivory-deep | #dccfb3 | pressed insets |
| --ink | #1a1210 | text on ivory |
| --brass | #b8862b | THE accent: chips, dealer button, highlights |
| --brass-hi | #e6c26a | foil highlight |
| --smoke | rgb(240 230 210 / 0.6) | secondary text on felt |
| --danger | #d33b2f | 다이, all-in warnings |

## Cards & chips
Cards from `@yujun/hwatu` (`cardSvg`), same chrome as Go-Stop (`HwatuCard.svelte`). Own two
cards sit large at the bottom, slightly fanned (-6°/+6°); opponents' cards are face-down
backs beside their seat, flipping at showdown one by one (`flip` keyframe, 420ms, stagger
220ms). Chips: stacked discs (brass 1000s, ivory 100s, red 10s) with a hairline edge; the pot
is a loose pile in the center. Never color-only: every chip stack shows its total.

## Type
- Display: Song Myung — hand labels (38광땡, 갑오…), seat names, the title. Min 20px.
- Body: Gowun Batang — prose, rules.
- UI: Noto Sans KR 500/700 — action bar, numbers (tabular).

## Motion
- Chip slide: bet chips glide from the seat to the pot (320ms, settle), stack sound.
- Action stamps: 따당 / 하프 / 올인 / 다이 pop at the seat (0.3 → 1.05 → 1, 300ms).
- Showdown: heartbeat pulse on the table (2 beats), cards flip in seat order, the hand label
  fades in under each; best hand gets brass rays; 광땡 tier 3, 땡 tier 2, 갑오/알리 tier 1.
- Pot sweep: the pile slides to the winner while the stack counter counts up (600ms).

## Sound (synthesized)
chip stack (short clicks), slide (soft noise), stamp hit, heartbeat (two low sines), flip
(paper snap), win chord / lose descend, 구사 shuffle rustle.

## Anti-slop checklist
- [ ] no purple, no glass blur, no emoji, no Inter
- [ ] brass focus ring
- [ ] empty seats are designed (dashed brass ring + "빈자리")
- [ ] grain on ivory, vignette on felt
- [ ] every action has a sound and a reduced-motion fallback
