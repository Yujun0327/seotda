import { HIDDEN } from './cards'
import { deepClone } from './clone'
import type { GameState, Seat } from './types'

/**
 * The viewer's redacted picture of the table: other seats' cards are hidden
 * during betting, folded hands are never shown, an uncontested winner keeps
 * their hand, and the deck is always hidden. Between deals the showdown
 * hands in `lastDeal` are public.
 *
 * Display-only privacy (honor system): every client still derives the full
 * state from the shared seed, and `publicHash` covers all of it — see
 * README Known limitations.
 */
export function redact(state: GameState, viewer: Seat | null): GameState {
  const view = deepClone(state)
  const recap = view.phase !== 'betting' && view.lastDeal?.dealIndex === view.dealIndex ? view.lastDeal : null
  view.players.forEach((p, seat) => {
    if (seat === viewer) return
    const shown = recap?.hands.some((h) => h.seat === seat) ?? false
    if (!shown) p.cards = p.cards.map(() => HIDDEN)
  })
  view.deck = view.deck.map(() => HIDDEN)
  return view
}
