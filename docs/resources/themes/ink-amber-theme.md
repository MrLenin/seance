# Seance theme — "Ink & Amber" (light + dark)

Colour-only redesign of the existing chat client. **No layout, spacing, or component-structure
changes are intended** — replace colour values only, via CSS custom properties.

Reference mockups in this folder: `mockup-light.png`, `mockup-dark.png`.

## Design intent

- The **chat surface** (message list, header, composer) is deliberately quiet: one paper tone,
  one ink tone, hairline rules, no gradients, no background image or texture. All contrast work
  is done by the text itself.
- The **sidebar rail** carries the personality: a dark espresso surface with a subtle top-to-bottom
  gradient, warm-grey channel labels, and an amber accent used sparingly (active-channel marker,
  unread badge, logo).
- Palette is warm/low-blue throughout — the warmest of the directions, chosen for long evening
  sessions.
- Accent (amber) appears at most 3–4 times per screen. It is never used as a large fill behind
  body text.

## Token set

Implement as CSS custom properties. Names below are the contract — use them verbatim so both
themes are interchangeable.

### Chat surface

| Token                | Light           | Dark      | Used for                                                 |
| -------------------- | --------------- | --------- | -------------------------------------------------------- |
| `--chat-bg`          | `#fdfbf7`       | `#1c1a18` | message list, header, composer background                |
| `--chat-fg`          | `#2a2521`       | `#ece6dc` | message body text, channel title, `<strong>`             |
| `--chat-fg-muted`    | `#8a8075`       | `#988f84` | system/join text, "Channel mode is…", header icons       |
| `--chat-fg-faint`    | `#a89e91`       | `#7e7569` | timestamps, hostmasks, placeholder text, divider labels  |
| `--chat-rule`        | `#ece5d9`       | `#2b2724` | header bottom border, day dividers                       |
| `--chat-accent`      | `#b4741a`       | `#e0a340` | links, "N online", new-message divider, send button fill |
| `--chat-accent-fg`   | `#fdfbf7`       | `#1c1a18` | text/icon on top of `--chat-accent`                      |
| `--chat-accent-rule` | `#b4741a` @ 50% | `#7d5a22` | the "New messages" hairline                              |
| `--composer-bg`      | `#f7f3ea`       | `#232120` | input field fill                                         |
| `--composer-border`  | `#e3dccd`       | `#322d29` | input field border                                       |
| `--titlebar-bg`      | `#efe9de`       | `#1a1816` | window chrome strip                                      |
| `--titlebar-fg`      | `#7a7166`       | `#8b8177` | window title text                                        |
| `--window-border`    | `#e3ddd1`       | `#2a2724` | outer window border                                      |

### Sidebar rail

| Token                   | Light     | Dark      | Used for                                                 |
| ----------------------- | --------- | --------- | -------------------------------------------------------- |
| `--rail-bg-top`         | `#2e2823` | `#1b1815` | gradient stop 0%                                         |
| `--rail-bg-bottom`      | `#211c19` | `#100e0d` | gradient stop 100%                                       |
| `--rail-fg`             | `#cfc5b8` | `#c6bcaf` | idle channel names, network name                         |
| `--rail-fg-strong`      | `#f0e7da` | `#f0e7da` | channels with unread messages                            |
| `--rail-fg-active`      | `#fbf6ee` | `#fbf6ee` | the active channel name                                  |
| `--rail-fg-muted`       | `#8b8177` | `#7e7569` | section labels, counts, footer links, close ✕            |
| `--rail-item-active-bg` | `#3b322b` | `#282320` | active channel row fill                                  |
| `--rail-accent`         | `#d99a2b` | `#e0a340` | 2px active-row left marker, unread badge fill, logo tile |
| `--rail-accent-fg`      | `#211c19` | `#17150f` | text on the amber badge                                  |
| `--rail-badge-bg`       | `#3f362e` | `#2e2925` | neutral count badge (e.g. `117`)                         |
| `--rail-badge-fg`       | `#e9dfd0` | `#e9dfd0` | text in the neutral badge                                |
| `--rail-input-bg`       | `#1b1714` | `#0c0b0a` | "Jump to…" field fill                                    |
| `--rail-input-border`   | `#3c342d` | `#2b2724` | "Jump to…" field border                                  |

Note the rail is dark in **both** themes; only its depth changes. This is intentional — it keeps
the app recognisable across themes and lets the chat surface be the only thing that inverts.

### Nick colours (message authors)

Assign deterministically (hash nick → index) from a 3-colour rotation per theme. These are tuned
to sit ≥4.5:1 on the chat background and to stay distinguishable from each other.

| Slot       | Light     | Dark      |
| ---------- | --------- | --------- |
| `--nick-1` | `#b06a20` | `#e6a45c` |
| `--nick-2` | `#7d7a2c` | `#cfcb84` |
| `--nick-3` | `#9a5b4a` | `#dfa08e` |

Semantic event colours: join arrow `#7d9a4a` (light) / `#9fbf6a` (dark). Quit/part and errors
should use a desaturated brick in the same family: `#a4472e` (light) / `#e08a72` (dark).

## Implementation (Vue 3)

Put both palettes on the document root and switch with an attribute, so no component needs to know
which theme is active:

```css
/* theme.css — imported once, e.g. in main.ts */
:root,
[data-theme="light"] {
  --chat-bg: #fdfbf7;
  --chat-fg: #2a2521;
  --chat-fg-muted: #8a8075;
  --chat-fg-faint: #a89e91;
  --chat-rule: #ece5d9;
  --chat-accent: #b4741a;
  --chat-accent-fg: #fdfbf7;
  --composer-bg: #f7f3ea;
  --composer-border: #e3dccd;
  --titlebar-bg: #efe9de;
  --titlebar-fg: #7a7166;
  --window-border: #e3ddd1;

  --rail-bg-top: #2e2823;
  --rail-bg-bottom: #211c19;
  --rail-fg: #cfc5b8;
  --rail-fg-strong: #f0e7da;
  --rail-fg-active: #fbf6ee;
  --rail-fg-muted: #8b8177;
  --rail-item-active-bg: #3b322b;
  --rail-accent: #d99a2b;
  --rail-accent-fg: #211c19;
  --rail-badge-bg: #3f362e;
  --rail-badge-fg: #e9dfd0;
  --rail-input-bg: #1b1714;
  --rail-input-border: #3c342d;

  --nick-1: #b06a20;
  --nick-2: #7d7a2c;
  --nick-3: #9a5b4a;
  --event-join: #7d9a4a;
  --event-quit: #a4472e;

  color-scheme: light;
}

[data-theme="dark"] {
  --chat-bg: #1c1a18;
  --chat-fg: #ece6dc;
  --chat-fg-muted: #988f84;
  --chat-fg-faint: #7e7569;
  --chat-rule: #2b2724;
  --chat-accent: #e0a340;
  --chat-accent-fg: #1c1a18;
  --composer-bg: #232120;
  --composer-border: #322d29;
  --titlebar-bg: #1a1816;
  --titlebar-fg: #8b8177;
  --window-border: #2a2724;

  --rail-bg-top: #1b1815;
  --rail-bg-bottom: #100e0d;
  --rail-fg: #c6bcaf;
  --rail-fg-strong: #f0e7da;
  --rail-fg-active: #fbf6ee;
  --rail-fg-muted: #7e7569;
  --rail-item-active-bg: #282320;
  --rail-accent: #e0a340;
  --rail-accent-fg: #17150f;
  --rail-badge-bg: #2e2925;
  --rail-badge-fg: #e9dfd0;
  --rail-input-bg: #0c0b0a;
  --rail-input-border: #2b2724;

  --nick-1: #e6a45c;
  --nick-2: #cfcb84;
  --nick-3: #dfa08e;
  --event-join: #9fbf6a;
  --event-quit: #e08a72;

  color-scheme: dark;
}
```

Toggle with `document.documentElement.dataset.theme = 'dark' | 'light'`, persisted in
`localStorage` and defaulting to `matchMedia('(prefers-color-scheme: dark)')`.

Then consume tokens in components — no literal hex values in any `.vue` file:

```vue
<style scoped>
.sidebar {
  background: linear-gradient(180deg, var(--rail-bg-top) 0%, var(--rail-bg-bottom) 100%);
  color: var(--rail-fg);
}
.channel.is-active {
  background: var(--rail-item-active-bg);
  color: var(--rail-fg-active);
  box-shadow: inset 2px 0 0 var(--rail-accent); /* left marker, no layout shift */
}
.channel.has-unread {
  color: var(--rail-fg-strong);
  font-weight: 600;
}
</style>
```

## Interaction states (not shown in the mockup — derive these)

- **Channel hover (idle row):** `color-mix(in oklab, var(--rail-item-active-bg) 60%, transparent)`
  background; text goes to `--rail-fg-active`. No accent marker on hover.
- **Message hover:** `color-mix(in oklab, var(--chat-fg) 3%, var(--chat-bg))` row background —
  subtle enough not to compete with the text.
- **Mention/highlight row:** left marker `inset 2px 0 0 var(--chat-accent)` plus
  `color-mix(in oklab, var(--chat-accent) 8%, var(--chat-bg))` background. Never tint the text.
- **Focus ring:** 2px `var(--chat-accent)` at 60% opacity, 2px offset, on composer and search.
- **Selection:** `color-mix(in oklab, var(--chat-accent) 22%, var(--chat-bg))`, text stays `--chat-fg`.
- **Links:** `--chat-accent`, underlined on hover only; visited links unchanged (IRC logs are
  transient).

## Constraints to preserve

1. Body text hits ≥4.5:1 on `--chat-bg` in both themes; timestamps and hostmasks are the only
   deliberately low-emphasis text and stay ≥3:1 — do not lighten them further.
2. Never put body text on an amber fill, and never apply opacity to message text to mute it —
   use the `--chat-fg-*` ramp.
3. No gradient, image, or pattern behind the message list in either theme.
4. Amber is a signal colour. If a new UI element needs emphasis, prefer weight or the `--chat-fg`
   ramp before reaching for the accent.
