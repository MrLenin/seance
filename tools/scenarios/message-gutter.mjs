// The chat gutter — the time and nick columns left of every message — at
// every font-size step and clock setting: the columns are sized in rem to
// the text they hold (style.css `#chat .time`, `#chat .from`), so at no
// step may a time clip and at no step should the gutter carry much more
// slack than at the default. Measures the text against its column and
// screenshots the chat at each step for the eye.
//
//   corepack yarn build && python3 -m http.server -d public 8000 &
//   node tools/browser-drive.mjs tools/scenarios/message-gutter.mjs

const RUN = Date.now().toString(36);
const NICK = `gut${RUN}`;
const BASE = process.env.SEANCE_BASE ?? "http://localhost:8000/";

export const url = `${BASE}?host=127.0.0.1&port=8067&tls=false&nick=${NICK}&join=%23seance`;

const STEPS = ["tiny", "small", "medium", "large", "xlarge", "huge"];
// SEANCE_CLOCK=24h|12h|24h+s|12h+s picks the clock setting for the run; the
// format the DOM shows follows the setting, so it is set before boot.
const CLOCK = process.env.SEANCE_CLOCK ?? "12h";
const SETTINGS = {use12hClock: CLOCK.startsWith("12"), showSeconds: CLOCK.endsWith("+s")};

// Text width against column width for the last own message, in px.
const MEASURE = `(() => {
	const msg = [...document.querySelectorAll('#chat .msg.self[data-type="message"]')].pop();
	if (!msg) return null;
	const t = msg.querySelector(".time"), f = msg.querySelector(".from");
	const textW = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
	const c = msg.querySelector(".content");
	return {
		time: t.textContent.trim(), timeCol: t.getBoundingClientRect().width, timeText: textW(t),
		timeLines: (() => { const r = document.createRange(); r.selectNodeContents(t); return r.getClientRects().length; })(),
		fromCol: f.getBoundingClientRect().width, fromText: textW(f),
		gutter: c.getBoundingClientRect().left - msg.getBoundingClientRect().left,
		root: parseFloat(getComputedStyle(document.documentElement).fontSize),
	};
})()`;

export default async function run(page) {
	await page.addInitScript(
		`localStorage.setItem("settings", JSON.stringify(${JSON.stringify(SETTINGS)}))`
	);
	await page.goto(page.url, {waitForSelector: "#connect form"});
	await page.click('#connect button[type="submit"]');
	await page.waitFor(`!!document.querySelector("#form #input")`, {
		timeout: 20000,
		label: "chat input up",
	});
	await page.sleep(1500);

	for (const text of ["first line of the gutter check", "a second, so the column has two rows"]) {
		await page.fill("#input", text);
		await page.evaluate(`document.querySelector("#form").requestSubmit()`);
		await page.sleep(600);
	}
	await page.waitFor(`document.querySelectorAll('#chat .msg[data-type="message"]').length >= 2`, {
		label: "own messages shown",
	});

	const rows = [];
	for (const step of STEPS) {
		await page.evaluate(`document.documentElement.dataset.fontSize = ${JSON.stringify(step)}`);
		await page.sleep(80);
		const m = await page.evaluate(MEASURE);
		rows.push({step, clock: CLOCK, ...m});
		page.check(`${step} ${CLOCK}: time fits its column`, m.timeText <= m.timeCol + 0.5);
		page.check(`${step} ${CLOCK}: time on one line`, m.timeLines === 1);
		// The own messages, wherever the bots have scrolled them to: the
		// measured row, scrolled into view, and its neighbours.
		await page.evaluate(
			`[...document.querySelectorAll('#chat .msg.self[data-type="message"]')].pop().scrollIntoView({block: "center"})`
		);
		await page.sleep(100);
		const box = await page.evaluate(
			`(() => { const r = [...document.querySelectorAll('#chat .msg.self[data-type="message"]')].pop().getBoundingClientRect(); return {x: r.left - 4, y: r.top - 3 * r.height, width: Math.min(r.width, 700), height: r.height * 6}; })()`
		);
		await page.screenshot(`gutter-${CLOCK}-${step}`, {clip: box});
	}
	console.table(
		rows.map((r) => ({
			...r,
			timeCol: Math.round(r.timeCol),
			timeText: Math.round(r.timeText),
			fromCol: Math.round(r.fromCol),
			fromText: Math.round(r.fromText),
			gutter: Math.round(r.gutter),
		}))
	);
	page.check("no console errors", page.consoleErrors.length === 0);
}
