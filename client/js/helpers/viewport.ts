/**
 * Sizes the app to the visual viewport on touch devices.
 *
 * iOS does not shrink the layout viewport for the on-screen keyboard:
 * `innerHeight` stays put while `visualViewport.height` drops, so an app at
 * `height: 100%` keeps its composer behind the keyboard. `--viewport-height`
 * publishes the visual viewport and <body> is sized from it (style.css).
 *
 * Written on every event rather than behind a guard, so a stale value never
 * outlives the keyboard, and only on touch-primary devices, so a desktop
 * pinch-zoom leaves the layout alone. A no-op on Android, where Chrome
 * honours `interactive-widget=resizes-content` and the two viewports agree.
 *
 * Vue-free; boot.ts installs it.
 */

import {hasVirtualKeyboard} from "./device";

/** How long the keyboard takes to animate in or out, with a margin. */
export const KEYBOARD_SETTLE_MS = 350;

export function installViewportHooks(): void {
	const viewport = window.visualViewport;

	if (!viewport || !hasVirtualKeyboard()) {
		return;
	}

	const apply = () => {
		document.documentElement.style.setProperty(
			"--viewport-height",
			`${Math.round(viewport.height)}px`
		);

		// The app fills the visible band, so anything iOS scrolled away is the
		// header. scrollTo(0, 0) at 0 fires no scroll event, so this cannot loop.
		if (viewport.offsetTop > 0 || window.scrollY > 0) {
			window.scrollTo(0, 0);
		}
	};

	// The event that announces the keyboard carries a mid-animation height.
	const applySettled = () => {
		apply();
		setTimeout(apply, KEYBOARD_SETTLE_MS);
	};

	viewport.addEventListener("resize", applySettled);
	viewport.addEventListener("scroll", apply);
	window.addEventListener("resize", applySettled);
	// Focus is what summons and dismisses the keyboard, and it is not a resize.
	window.addEventListener("focusin", applySettled);
	window.addEventListener("focusout", applySettled);

	applySettled();
}
