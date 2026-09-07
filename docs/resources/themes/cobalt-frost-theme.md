# Seance theme — "Cobalt Frost" (light + dark)

Colour-only redesign of the existing chat client. **No layout, spacing, or component-structure
changes are intended** — replace colour values only, via CSS custom properties.

Reference mockups in this folder: `mockup-light.png`, `mockup-dark.png`.

## Design intent

- The **chat surface** (message list, header, composer) is deliberately quiet: one cool paper tone,
  one ink tone, hairline rules, no gradients, no background image or texture.
- The **sidebar rail** carries the personality: a deep cobalt-navy surface lit from the top by a
  gradient, cool-grey channel labels, and an iced-cyan accent used sparingly (active-channel
  marker, unread badge, logo).
- Palette is cool/neutral — crisp and "technical", the counterpart to the warm direction.
- Two accents, split by role: **cyan** (`--rail-accent`) is the rail's signal colour;
  **blue** (`--chat-accent`) is the chat surface's link/action colour. Do not swap them — cyan on
  the light chat background is not readable at text sizes.

## Token set

Implement as CSS custom properties. Names below are the contract — use them verbatim so both
themes are interchangeable.

### Chat surface

| Token                | Light           | Dark      | Used for                                                 |
| -------------------- | --------------- | --------- | -------------------------------------------------------- |
| `--chat-bg`          | `#f8fafc`       | `#0f151d` | message list, header, composer background                |
| `--chat-fg`          | `#16202c`       | `#e2eaf4` | message body text, channel title, `<strong>`             |
| `--chat-fg-muted`    | `#6b7a8c`       | `#8493a6` | system/join text, "Channel mode is…", header icons       |
| `--chat-fg-faint`    | `#94a3b4`       | `#75859a` | timestamps, hostmasks, placeholder text, divider labels  |
| `--chat-rule`        | `#e4eaf1`       | `#1c2530` | header bottom border, day dividers                       |
| `--chat-accent`      | `#1f6feb`       | `#63b3ff` | links, "N online", new-message divider, send button fill |
| `--chat-accent-fg`   | `#f8fafc`       | `#0f151d` | text/icon on top of `--chat-accent`                      |
| `--chat-accent-rule` | `#1f6feb` @ 45% | `#2b5f96` | the "New messages" hairline                              |
| `--composer-bg`      | `#eff4f9`       | `#161d27` | input field fill                                         |
| `--composer-border`  | `#dde5ee`       | `#23303e` | input field border                                       |
| `--titlebar-bg`      | `#eef2f7`       | `#101720` | window chrome strip                                      |
| `--titlebar-fg`      | `#6b7a8c`       | `#7b8aa0` | window title text                                        |
| `--window-border`    | `#dbe3ec`       | `#1c2530` | outer window border                                      |

### Sidebar rail

| Token                   | Light     | Dark      | Used for                                                 |
| ----------------------- | --------- | --------- | -------------------------------------------------------- |
| `--rail-bg-top`         | `#1d2d4a` | `#101d2e` | gradient stop 0%                                         |
| `--rail-bg-bottom`      | `#0e1828` | `#070b11` | gradient stop 100%                                       |
| `--rail-fg`             | `#c3d0e2` | `#bccbdd` | idle channel names, network name                         |
| `--rail-fg-strong`      | `#eaf2fb` | `#eaf2fb` | channels with unread messages                            |
| `--rail-fg-active`      | `#f4f9ff` | `#f4f9ff` | the active channel name                                  |
| `--rail-fg-muted`       | `#7f90a6` | `#75859a` | section labels, counts, footer links, close ✕            |
| `--rail-item-active-bg` | `#26385a` | `#18263a` | active channel row fill                                  |
| `--rail-accent`         | `#4fd0e0` | `#4fd0e0` | 2px active-row left marker, unread badge fill, logo tile |
| `--rail-accent-fg`      | `#0e1828` | `#08111a` | text on the cyan badge                                   |
| `--rail-badge-bg`       | `#2a3a56` | `#1e2b3c` | neutral count badge (e.g. `117`)                         |
| `--rail-badge-fg`       | `#d3dfee` | `#d3dfee` | text in the neutral badge                                |
| `--rail-input-bg`       | `#0c1522` | `#060a10` | "Jump to…" field fill                                    |
| `--rail-input-border`   | `#2b3d5c` | `#1e2b3c` | "Jump to…" field border                                  |

The rail is dark in **both** themes; only its depth changes. Intentional — it keeps the app
recognisable across themes and lets the chat surface be the only thing that inverts.

Logo tile / avatar fallback gradient: `linear-gradient(150deg, #4fd0e0, #1f6feb)` (light rail) and
`linear-gradient(150deg, #4fd0e0, #2a63c8)` (dark rail).

### Nick colours (message authors)

Assign deterministically (hash nick → index) from a 3-colour rotation per theme. Tuned to sit
≥4.5:1 on the chat background and to stay distinguishable from each other.

| Slot       | Light     | Dark      |
| ---------- | --------- | --------- |
| `--nick-1` | `#1f6feb` | `#63b3ff` |
| `--nick-2` | `#0e8080` | `#4fd0c0` |
| `--nick-3` | `#7040c8` | `#b09aff` |

Semantic event colours: join arrow `#2f8f5b` (light) / `#5fc78d` (dark); quit/part and errors
`#c0392b` (light) / `#ff8f80` (dark).

## Implementation (Vue 3)

Put both palettes on the document root and switch with an attribute, so no component needs to know
which theme is active:

```css
/* theme.css — imported once, e.g. in main.ts */
:root,
[data-theme="light"] {
  --chat-bg: #f8fafc;
  --chat-fg: #16202c;
  --chat-fg-muted: #6b7a8c;
  --chat-fg-faint: #94a3b4;
  --chat-rule: #e4eaf1;
  --chat-accent: #1f6feb;
  --chat-accent-fg: #f8fafc;
  --composer-bg: #eff4f9;
  --composer-border: #dde5ee;
  --titlebar-bg: #eef2f7;
  --titlebar-fg: #6b7a8c;
  --window-border: #dbe3ec;

  --rail-bg-top: #1d2d4a;
  --rail-bg-bottom: #0e1828;
  --rail-fg: #c3d0e2;
  --rail-fg-strong: #eaf2fb;
  --rail-fg-active: #f4f9ff;
  --rail-fg-muted: #7f90a6;
  --rail-item-active-bg: #26385a;
  --rail-accent: #4fd0e0;
  --rail-accent-fg: #0e1828;
  --rail-badge-bg: #2a3a56;
  --rail-badge-fg: #d3dfee;
  --rail-input-bg: #0c1522;
  --rail-input-border: #2b3d5c;

  --nick-1: #1f6feb;
  --nick-2: #0e8080;
  --nick-3: #7040c8;
  --event-join: #2f8f5b;
  --event-quit: #c0392b;

  color-scheme: light;
}

[data-theme="dark"] {
  --chat-bg: #0f151d;
  --chat-fg: #e2eaf4;
  --chat-fg-muted: #8493a6;
  --chat-fg-faint: #75859a;
  --chat-rule: #1c2530;
  --chat-accent: #63b3ff;
  --chat-accent-fg: #0f151d;
  --composer-bg: #161d27;
  --composer-border: #23303e;
  --titlebar-bg: #101720;
  --titlebar-fg: #7b8aa0;
  --window-border: #1c2530;

  --rail-bg-top: #101d2e;
  --rail-bg-bottom: #070b11;
  --rail-fg: #bccbdd;
  --rail-fg-strong: #eaf2fb;
  --rail-fg-active: #f4f9ff;
  --rail-fg-muted: #75859a;
  --rail-item-active-bg: #18263a;
  --rail-accent: #4fd0e0;
  --rail-accent-fg: #08111a;
  --rail-badge-bg: #1e2b3c;
  --rail-badge-fg: #d3dfee;
  --rail-input-bg: #060a10;
  --rail-input-border: #1e2b3c;

  --nick-1: #63b3ff;
  --nick-2: #4fd0c0;
  --nick-3: #b09aff;
  --event-join: #5fc78d;
  --event-quit: #ff8f80;

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
- **Message hover:** `color-mix(in oklab, var(--chat-fg) 3%, var(--chat-bg))` row background.
- **Mention/highlight row:** left marker `inset 2px 0 0 var(--chat-accent)` plus
  `color-mix(in oklab, var(--chat-accent) 8%, var(--chat-bg))` background. Never tint the text.
- **Focus ring:** 2px `var(--chat-accent)` at 60% opacity, 2px offset, on composer and search.
- **Selection:** `color-mix(in oklab, var(--chat-accent) 20%, var(--chat-bg))`, text stays `--chat-fg`.
- **Links:** `--chat-accent`, underlined on hover only.

## Constraints to preserve

1. Body text hits ≥4.5:1 on `--chat-bg` in both themes; timestamps and hostmasks are the only
   deliberately low-emphasis text and stay ≥3:1 — do not lighten them further.
2. Cyan (`--rail-accent`) is for the dark rail only. On the light chat surface use
   `--chat-accent` (blue).
3. No gradient, image, or pattern behind the message list in either theme.
4. Never mute message text with opacity — use the `--chat-fg-*` ramp.
