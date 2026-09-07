# Themes

A theme is one plain CSS file in `client/themes/`, copied by webpack to `public/themes/` and loaded after `css/style.css` through the `<link id="theme">` in `index.html`. Picking a theme in Settings → Appearance rewrites that link's `href` to `themes/<name>.css` (`client/js/settings.ts`); `js/loading-error-handlers.js` does the same from localStorage before the app boots so there is no flash of the wrong theme. There is no preprocessing: a theme's rules simply cascade over the base stylesheet, and the user's custom stylesheet (Settings → Appearance) cascades over the theme.

`style.css` declares its palette as custom properties on `:root` (`--body-color`, `--window-bg-color`, `--link-color`, `--highlight-bg-color`, the `--tok-*` code colours, …) and reads them everywhere it can, so most of a theme is a `:root` block. Where the base stylesheet still has literal colours (the sidebar rows and badges, header icons, the input and the context menu, message-type icons, the mIRC colour table) a theme restates those selectors.

## The themes

| Name      | Look                                                                                 | Notes                                                                                                  |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `coffee`  | "Ink & Amber", dark: espresso rail, a near-black paper surface, amber as the signal. | **The default.** Every rule reads a token; `creama.css` re-declares the tokens and inherits the rules. |
| `creama`  | "Ink & Amber", light: the same dark rail, the chat surface on warm paper.            | `@import "coffee.css"`, then the light token values.                                                   |
| `day`     | TheLounge's original light theme: white windows on the blue-grey `#415364`.          | Was `default` until 2026-09; it is the base the other themes' window frame comes from.                 |
| `morning` | TheLounge's original dark theme.                                                     | `@import "day.css"`.                                                                                   |

The list the Settings dropdown shows is static, in `client/js/configuration.ts` (`themes`, with a `displayName` and an optional `themeColor` for the browser chrome), and `defaultTheme` there is what a fresh browser gets; a deploy overrides that with `theme` in `config.json` (`docs/resources/branding.md`). A stored theme name the build no longer has falls back to the default at boot (`boot.ts`), which is how browsers that had `default` stored came over to `coffee`.

**To add a theme:** drop `client/themes/<name>.css` in, add its entry to `themes` in `configuration.ts`, and add the name to the list in `test/tests/build.ts`. Start from `creama.css` for a variant of the Ink & Amber direction (tokens only), from `morning.css` for a theme on TheLounge's variables.

## Ink & Amber

`coffee` and `creama` implement the warm direction of the colour redesign handed off in `docs/resources/themes/ink-amber-theme.md`; the cool direction, `cobalt-frost-theme.md`, is not implemented yet and would be built the same way. The handoff is colour only, and so are the themes: layout, spacing and type are untouched, and its suggestions beyond colour (a `data-theme` switch, sweeping the components for literal colours, hover/focus/mention states) were deliberately left for later.

The custom properties in `coffee.css` use the handoff's token names (`--chat-bg`, `--rail-accent`, …) so a value can be checked against its tables, plus a few the handoff does not have: the tints (`--tint-soft`/`--tint-strong`, translucent overlays that must be light on a dark surface and dark on a light one), the notice-box pairs (`--note-*`, `--warn-*`, `--error-*`, `--ok-*`), `--menu-bg`, and the message semantics (`--event-join`, `--event-quit`, `--nick-default`, `--notice-color`, `--action-color`). TheLounge's own variables are mapped onto the tokens at the end of `:root`, which is what keeps the rest of `style.css` in step.

Deviations from the handoff, all for contrast (`docs/projects/accessibility.md`), are listed in the header comment of each file: the light variant's muted text, link amber, join green and placeholder tone are darker than specified because the handoff's own values missed its 4.5:1 rule; the dark variant's footer icons use the light rail's muted tone. Nick colours are the biggest addition: the handoff gives three per variant, `style.css` hashes nicks into 32 slots (`.user.color-1`…`-32`), so each theme carries a generated 32-colour palette at the handoff's nick lightness, hues around the wheel with the chroma lowered on the cool side, every slot ≥ 4.6:1 (coffee) or ≥ 5:1 (creama) on the chat surface so it still reads on a highlighted row.

The rail gradient is on `body` as well as `#sidebar`, so the gutter `day.css` keeps around the window continues the sidebar instead of stopping at its edge; the two gradients coincide because both span the viewport.

## Checking a theme

`yarn test` never loads a stylesheet. Build, serve `public/`, and look (`docs/resources/browser-testing.md`); the Appearance dropdown switches live. For contrast, `tools/scenarios/reaction-picker.mjs` shows the pattern of measuring a computed colour pair in the page.
