# Composing mIRC colours: a picker, not a memorised number

_Noted 2026-09-01. Status: idea, not started. Related: `client/components/ChatInput.vue`
(`formattingHotkeys`, `wrapCursor`), `client/js/autocompletion.ts` (the colour
strategies), `docs/projects/markdown-messages.md` (the other formatting axis),
[IRC Formatting](https://modern.ircdocs.horse/formatting) (the wire format)._

## Idea

Colour is the one formatting feature we can render far better than we can
author. The renderer handles all 99 indexed colours and hex, and the composer
gives you a control character and wishes you luck. Give the input a real
colour picker — swatches you can see, reachable on a phone, with the result
visible before you hit enter.

## Current behaviour

More exists than you would guess, and it is all keyboard-only:

- `ChatInput.vue:99-107` — `formattingHotkeys` binds `mod+k` → `\x03`, plus
  `mod+b` `\x02`, `mod+u` `\x1F`, `mod+i` `\x1D`, `mod+o` `\x0F`, `mod+s`
  `\x1E`, `mod+m` `\x11`. `ChatInput.vue:343-360` runs them through
  `wrapCursor`: with a selection the code goes on **both** sides, with a bare
  caret it is inserted once.
- `client/js/autocompletion.ts:86-152` — once a `\x03` is in the input, a
  textcomplete dropdown fuzzy-matches colour **names** (`foregroundColorStrategy`),
  and a second one fires after `fg,` for the background
  (`backgroundColorStrategy`). Each row is rendered in the colour it names.
- `client/js/constants.ts:1-18` — but `colorCodeMap` has only **16** entries.

So the ceiling is not the renderer:

|                                         | Renders                                     | Can be composed                       |
| --------------------------------------- | ------------------------------------------- | ------------------------------------- |
| Colours 0–15                            | yes                                         | yes, via the typeahead                |
| Colours 16–98                           | yes (`style.css` has 99 `.irc-fgN` classes) | only by typing the digits from memory |
| Hex `\x04RRGGBB` (`parseStyle.ts:4,57`) | yes                                         | **no path at all**                    |

Other gaps, in rough order of how much they hurt:

1. **Nothing on touch.** A phone keyboard has no Ctrl. There is currently no
   way whatsoever to colour a message on mobile — not a degraded way, none.
2. **Invisible while composing.** `\x03` and its digits are zero-width in a
   `<textarea>`, so the composer shows neither the colour nor the codes. You
   find out what you wrote by sending it.
3. **Undiscoverable.** The typeahead only appears once a `\x03` is already
   there, which you can only do if you already knew about `mod+k`. Nothing in
   the UI mentions colour.
4. **No un-colour.** `mod+o` inserts a reset (`\x0F`) — it does not strip
   colour from a selection, and it kills bold/italic in the same stroke.
5. **`wrapCursor` is wrong for colour.** Wrapping a selection in `\x03…\x03`
   is right for bold (a toggle) but for colour the closing code should be
   `\x03` _or_ a restore of the previous colour, and the opening one needs
   digits appended before it means anything.

## Why not Ctrl+C

Worth writing down because it looks like the obvious binding: `\x03` **is**
Ctrl+C — ETX, the third ASCII control character, which is exactly why the
colour code is 3. But Ctrl+C is copy in every browser and every OS, and
intercepting it in a chat input would be indefensible. mIRC hit this in 1995
and settled on **Ctrl+K**; every client since has copied it, and we already
bind `mod+k`. Keep it.

## What other clients do

- **mIRC** — Ctrl+K pops a small palette at the caret; click a swatch and the
  code is inserted. This is the canonical interaction and worth copying almost
  exactly. Note their own users complain it still shows 16 swatches when the
  format has had 99 colours [since 7.x](https://forums.mirc.com/ubbthreads.php/topics/265859/ctrl-k-color-map) —
  the trap we are already in.
- **HexChat, irssi, WeeChat** — insert the raw control code, no picker. You
  memorise the numbers. This is our current behaviour minus the typeahead.
- **Konversation, Quassel, Textual** — a formatting toolbar or menu near the
  input with a colour grid and a preview swatch; discoverable by looking, and
  the model that survives on a touchscreen.
- **The Lounge** — the fuzzy name typeahead we inherit. The good idea here is
  matching on _names_ ("light blue") rather than numbers; the flaw is that it
  is invisible until you have already typed the control character.
- **IRCCloud** — no built-in picker; the ecosystem answer is
  [userscripts](https://greasyfork.org/en/scripts/17615-irccloud-formatting-helper/code)
  that bind Ctrl+B/Ctrl+I themselves. Evidence that shipping nothing pushes
  the problem to users, not that users don't want it.
- **Slack, Element, Discord** — WYSIWYG composer: markdown as the typed path,
  plus a toolbar that floats in on selection. Colour is not an IRC-style
  concept for them, but the _selection-toolbar_ pattern is the current
  convention for "format this text I just highlighted".

## Options

**A. Swatch popover at the caret on Ctrl+K** (mIRC's model). A grid of 16
quick colours, expandable to all 99, plus a hex field. `ReactionPicker.vue` is
the existing precedent for an input-anchored popover with roving focus and
Esc-to-close — reuse its mechanics rather than inventing a second popover.

**B. Floating toolbar on selection** (Slack/Element). Select text, a small
B/I/U + colour chip appears. Solves discoverability and reads as modern, but
adds a second formatting surface and fights text selection on mobile.

**C. Persistent formatting bar under the input**, toggleable, with a colour
button opening the same grid as A. Ugly on desktop, but it is the only option
in this list that a phone can use at all.

**D. WYSIWYG contenteditable** — show the colour live, serialise to control
codes on send. Correct end state, largest change: the composer is a
`<textarea>` that `multiline-messages` and `markdown-messages` both assume,
and paste/upload/autocomplete/typing-notification handling all hang off it.

Recommendation: **A + C sharing one picker component**, keeping the typeahead
as the fast keyboard path. A is the desktop interaction people already know,
C is the only way this works on a phone, and the grid is written once. B is
tempting but is really a fix for discoverability, which the C toolbar button
already gives us. Defer D and revisit only if the markdown work ends up
pushing the composer toward rich text anyway.

## Design notes

- **Selection semantics.** Colouring a selection should emit
  `\x03<fg>[,<bg>]<selection>\x03` — and, if the selection sat inside an
  existing colour run, restore that colour rather than resetting. Needs the
  parser's state at the selection boundary, so `parseStyle` (or a small
  cursor-context helper over it) becomes an input-side dependency.
- **Un-colour** should be a first-class picker entry ("Default"), emitting a
  bare `\x03` at the boundary rather than `\x0F`, so it does not clear bold.
- **Names beyond 15.** `colorCodeMap` only names 0–15. Colours 16–98 are a
  generated ramp; label them by number and let the swatch carry the meaning,
  but keep fuzzy name search working for the 16 that have names.
- **Byte budget.** `MAX_LINE_BYTES = 500` counts control codes. Verify
  `splitMessage` never splits between `\x03` and its digits, and that a split
  chunk re-opens the colour that was active at the break — otherwise a long
  coloured line loses its colour halfway.
- **Interaction with markdown.** `markdown-messages` just landed; colour codes
  are a separate axis and the picker must not emit anything the markdown
  tokenizer will re-read (a stray `_` or backtick from a colour name, say).
  Decide and document precedence once, in that doc or this one.
- **Accessibility.** Swatches need names/numbers in `aria-label`, not colour
  alone. The full 99 palette contains combinations that are unreadable on both
  themes — consider marking low-contrast pairs rather than hiding them, since
  the point is to reproduce what other clients send.
- **Preview.** Cheapest fix for "invisible while composing" short of D: render
  the pending message through the normal parser into a one-line preview strip
  above the input, shown only while the message contains formatting codes.

## Open questions

- Does the picker insert at the caret, or is it modal over a selection? (A
  wants both; the selection case is where the parser-state work lands.)
- Do we offer hex (`\x04`) at all? It renders, but support across other
  clients is thin, so a hex message may look plain to half the channel.
- Should the last-used colour be sticky per channel, the way mIRC remembers?
- Is there any appetite for a `/color` command as a scriptable path, or is the
  picker the whole feature?

## Done when

- Ctrl+K opens a swatch picker at the caret; clicking a swatch colours the
  selection or sets the colour at the caret; Esc closes without inserting.
- The same picker is reachable by tapping a toolbar button, with no keyboard.
- All 99 colours are selectable; 0–15 remain searchable by name.
- A selection can be un-coloured without losing bold/italic.
- Composing shows what will be sent, either inline or in a preview strip.
- Tests: the code the picker emits for caret vs. selection vs. nested-colour
  cases, the un-colour path, and a `splitMessage` case that splits a coloured
  line.
