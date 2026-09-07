# Seance colour themes — handoff

Two approved colour directions for the chat client, each with a light and a dark variant. This is a
**colour-only** redesign: layout, spacing, type scale, and component structure stay as they are
today.

```
ink-amber-theme.md        full token set, CSS, states, constraints
ink-amber-light.png       reference render (820×470 UI, 2x)
ink-amber-dark.png
cobalt-frost-theme.md
cobalt-frost-light.png
cobalt-frost-dark.png
```

_(The handoff came as `ink-amber/` and `cobalt-frost/` folders; it is kept flat here, and
`ink-amber` is implemented as the `coffee` and `creama` themes — see `../themes.md`.)_

Both themes use the **same token names**, so they are drop-in interchangeable — one `theme.css`
per direction, switched by `data-theme` on `<html>`. Ship both directions if you want a theme
picker: `ink-amber-light`, `ink-amber-dark`, `cobalt-frost-light`, `cobalt-frost-dark`.

Suggested approach for implementation:

1. Add one CSS file per direction defining the tokens under `[data-theme="…"]` selectors.
2. Sweep the Vue components and replace every hard-coded colour with the matching
   `var(--token)` — the tables in each `.md` say which token belongs to which UI element.
3. Add the theme store (`localStorage` + `prefers-color-scheme` default) and set
   `document.documentElement.dataset.theme`.
4. Derive hover/focus/mention states from the "Interaction states" section rather than inventing
   new hex values.

Shared rule across both: the message list is a flat single-colour surface with no image, gradient,
or pattern — all personality lives in the sidebar rail.
