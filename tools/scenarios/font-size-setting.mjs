// The font-size setting end to end in a real browser: the Appearance slider
// moves `data-font-size` on <html> live while dragging, the chat area
// (input, messages, user list) tracks `--user-font-size`, the stored value
// is the scale name and not the slider index, and the choice survives a
// reload (client/js/helpers/fontSize.ts, settings.ts, style.css).
//
//   corepack yarn build && python3 -m http.server -d public 8021 &
//   node tools/browser-drive.mjs tools/scenarios/font-size-setting.mjs
//
// The default target is a plain-WS ircd on 127.0.0.1:8067 (the dev ircd's
// ws:// port).

const RUN = Date.now().toString(36);
const NICK = `fs${RUN}`;
const BASE = "http://localhost:8021/";

export const url = `${BASE}?host=127.0.0.1&port=8067&tls=false&nick=${NICK}&join=%23seance`;

const DATASET = `document.documentElement.dataset.fontSize ?? null`;
const VAR = `getComputedStyle(document.documentElement).getPropertyValue("--user-font-size").trim()`;
const FORM_PX = `getComputedStyle(document.querySelector("#form")).fontSize`;
const USERLIST_PX = `getComputedStyle(document.querySelector(".userlist")).fontSize`;
const STORED = `JSON.parse(localStorage.getItem("settings") ?? "{}").fontSize ?? null`;
const SLIDER = `.font-size-setting input[type="range"]`;

export default async function run(page) {
	// A range input cannot be dragged through this driver (no key or mouse-move
	// API) and has no hover-gated behavior a synthetic event could fake its way
	// past; the claim under test is the Vue @input wiring, which a bubbling
	// `input` event exercises exactly as a drag does.
	const setSlider = (index) =>
		page.evaluate(
			`(() => {
				const el = document.querySelector(${JSON.stringify(SLIDER)});
				el.value = String(${index});
				el.dispatchEvent(new Event("input", {bubbles: true}));
			})()`
		);

	// A ?host link only pre-fills the connect form (a link is a suggestion,
	// boot.ts handleQueryParams); connect for real, autoconnect on so the
	// reload at the end brings the network back by itself.
	await page.goto(page.url, {waitForSelector: "#connect form"});
	await page.click('#connect input[name="autoconnect"]');
	await page.click('#connect button[type="submit"]');
	await page.waitFor(`!!document.querySelector("#form #input")`, {
		timeout: 20000,
		label: "chat input up",
	});
	page.check("boots at medium", (await page.evaluate(DATASET)) === "medium");
	page.check("default var is 14px", (await page.evaluate(VAR)) === "14px");
	page.check("input area at 14px", (await page.evaluate(FORM_PX)) === "14px");
	await page.screenshot("chat-medium");

	// To Settings → Appearance, by real clicks. Both are <button>s rendered
	// through custom router-links, not <a>s.
	await page.click(`#footer button.settings`);
	await page.waitFor(`!!document.querySelector(".settings-menu button.appearance")`, {
		label: "settings open",
	});
	await page.click(`.settings-menu button.appearance`);
	await page.waitFor(`!!document.querySelector(${JSON.stringify(SLIDER)})`, {label: "slider up"});
	page.check("slider sits at medium", (await page.evaluate(`document.querySelector(${JSON.stringify(SLIDER)}).value`)) === "2");

	await setSlider(5);
	page.check("html carries huge", (await page.evaluate(DATASET)) === "huge");
	page.check("var moves live", (await page.evaluate(VAR)) === "21px");
	page.check(
		"label reads Huge",
		(await page.evaluate(`document.querySelector(".font-size-value")?.textContent.trim()`)) ===
			"Huge"
	);
	page.check("stored as the name, not the index", (await page.evaluate(STORED)) === "huge");

	// The settings window's generic @change handler hears the drag end too;
	// the input has no `name` precisely so that handler cannot overwrite the
	// name with the raw slider index.
	await page.evaluate(
		`document.querySelector(${JSON.stringify(SLIDER)}).dispatchEvent(new Event("change", {bubbles: true}))`
	);
	page.check("drag end does not clobber", (await page.evaluate(STORED)) === "huge");
	await page.screenshot("settings-huge");

	// Spot-check the other end of the scale, then back to huge.
	await setSlider(0);
	page.check("tiny is 10px", (await page.evaluate(VAR)) === "10px");
	await setSlider(5);
	page.check("back to huge", (await page.evaluate(VAR)) === "21px");

	// Back on the channel the chat text actually wears it.
	await page.click(`.channel-list-item[data-name="#seance"]`);
	await page.waitFor(`!!document.querySelector("#form #input")`, {label: "back on chat"});
	page.check("input area at 21px", (await page.evaluate(FORM_PX)) === "21px");
	page.check("userlist at 21px", (await page.evaluate(USERLIST_PX)) === "21px");

	if ((await page.count(".messages .msg")) > 0) {
		page.check(
			"messages at 21px",
			(await page.evaluate(
				`getComputedStyle(document.querySelector(".messages .msg")).fontSize`
			)) === "21px"
		);
	}

	await page.screenshot("chat-huge");

	// Survives a reload. replaceState first so the ?uri params do not run
	// again (reload-on-settings.mjs explains the dance); same profile, so
	// localStorage is the thing being tested.
	await page.evaluate(
		`(() => { window.__coldLoad = true; history.replaceState(null, "", ${JSON.stringify(
			BASE
		)}); location.reload(); })()`
	);
	await page.waitFor(`!window.__coldLoad && !!document.querySelector("#form #input")`, {
		timeout: 20000,
		label: "rebooted onto chat",
	});
	page.check("huge survives reload", (await page.evaluate(DATASET)) === "huge");
	page.check("input area still 21px", (await page.evaluate(FORM_PX)) === "21px");
	await page.screenshot("reloaded-huge");

	page.check("no console errors", page.consoleErrors.length === 0);
}
