// One message shows its tap-opened action toolbar at a time.
//
//   corepack yarn build && python3 -m http.server -d public 8000 &
//   tools/nefarious-dev/run.sh -d
//   node tools/browser-drive.mjs tools/scenarios/message-actions-single.mjs --mobile
//
// `SEANCE_IRC_URL` and `SEANCE_IRC_CHANNEL` point it at another network:
//
//   SEANCE_IRC_URL=wss://irc.example.org:9998/ws SEANCE_IRC_CHANNEL='#textual' \
//     node tools/browser-drive.mjs tools/scenarios/message-actions-single.mjs --mobile
//
// It joins the channel twice (the app and a second user), says three lines
// and quits, so pick a channel where that is welcome.
//
// `--mobile` is required: the toolbar only opens on a tap where
// `(hover: none) and (pointer: coarse)` matches, and the scenario refuses to
// pass vacuously on a desktop viewport. Nothing in `yarn test` mounts a
// component, which is why this exists. The second user is driven over the
// same WebSocket the app uses, as tools/scenarios/reaction-picker.mjs does.

const IRCD = process.env.SEANCE_IRC_URL ?? "wss://localhost:8443/";
const CHANNEL = process.env.SEANCE_IRC_CHANNEL ?? "#seance";
const PORT = process.env.SEANCE_PORT ?? "8000";

const ircd = new URL(IRCD);

if (ircd.hostname === "localhost" || ircd.hostname === "127.0.0.1") {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // dev ircd's self-signed cert
}

// Two nicks per run, because a network that still holds the last run's
// connection would answer the reused one with 433 and the app has no second
// guess to make.
const stamp = Math.random().toString(36).slice(2, 6);
const NICK = `tapbar${stamp}`;
const TALKER = `taptalk${stamp}`;

// `host` carries a path when the ircd's WebSocket lives under one
// (`irc.example.org/wockets/secure`); see the comment on it in js/irc/types.ts.
const HOST = ircd.hostname + ircd.pathname.replace(/\/$/, "");
const IRC_PORT = ircd.port || (ircd.protocol === "wss:" ? "443" : "80");

export const url =
	`http://localhost:${PORT}/?host=${encodeURIComponent(HOST)}&port=${IRC_PORT}` +
	`&tls=${ircd.protocol === "wss:"}&nick=${NICK}&join=${encodeURIComponent(CHANNEL)}`;

/** The ids of every message currently showing a tap-opened toolbar. */
const OPEN = `Array.from(document.querySelectorAll("#chat .msg.actions-open")).map((m) => m.id)`;

/** A second user on the same network, so there are messages to tap. */
function speaker(nick) {
	const ws = new WebSocket(IRCD, ["text.ircv3.net"]);
	let onJoin = () => {};

	ws.onopen = () => {
		ws.send(`NICK ${nick}`);
		ws.send(`USER ${nick} 0 * :seance tap toolbar`);
	};

	ws.onmessage = (ev) => {
		const line = String(ev.data);

		if (line.startsWith("PING")) {
			ws.send(`PONG${line.slice(4)}`);
			return;
		}

		const params = (line.startsWith("@") ? line.slice(line.indexOf(" ") + 1) : line).split(" ");

		if (params[1] === "001") {
			ws.send(`JOIN ${CHANNEL}`);
		} else if (params[1] === "JOIN" && params[0].includes(nick)) {
			onJoin();
		} else if (params[1] === "433") {
			ws.send(`NICK ${nick}${Math.floor(Math.random() * 1000)}`);
		}
	};

	return {
		joined: new Promise((resolve, reject) => {
			onJoin = resolve;
			ws.onerror = (e) => reject(new Error(String(e.message ?? e)));
			setTimeout(() => reject(new Error(`${nick} never joined ${CHANNEL}`)), 20000);
		}),
		say: (text) => ws.send(`PRIVMSG ${CHANNEL} :${text}`),
		quit: () => ws.send("QUIT :done"),
	};
}

/** A real tap: what a finger sends, not a synthesised mouse click. */
async function tap(page, selector) {
	const r = await page.rect(selector);

	if (!r || (r.width === 0 && r.height === 0)) {
		throw new Error(`no visible element for ${selector}`);
	}

	// The left edge is the clock column and the right edge is where the
	// toolbar itself lands; aim at the text so the tap is on the row and on
	// nothing that handles it first.
	const at = {x: r.x + r.width / 3, y: r.y + r.height / 2};
	const touch = [{x: at.x, y: at.y, radiusX: 12, radiusY: 12, force: 1}];

	await page.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: touch});
	await page.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
	await page.sleep(200);
}

export default async function run(page) {
	await page.goto(page.url, {waitForSelector: "#connect form"});

	const touchDevice = await page.evaluate(
		`window.matchMedia("(hover: none) and (pointer: coarse)").matches`
	);
	await page.check(
		"the browser is emulating a touch device (else nothing here can open; pass --mobile)",
		touchDevice
	);

	await page.evaluate(`document.querySelector("#connect form").requestSubmit()`);
	await page.waitFor(`document.querySelector('.channel-list-item[data-name="${CHANNEL}"]')`, {
		timeout: 30000,
		label: `${CHANNEL} in the sidebar`,
	});
	await page.click(`.channel-list-item[data-name="${CHANNEL}"]`);

	// The channel has history, so previous runs are on screen too: mark this
	// run's messages and work only on the elements carrying the mark.
	const token = `tap-${Date.now().toString(36)}`;
	const talker = speaker(TALKER);
	await talker.joined;

	for (const n of [1, 2, 3]) {
		talker.say(`line ${n} of ${token}`);
	}

	await page.waitFor(
		`Array.from(document.querySelectorAll("#chat .msg .content")).filter((c) => c.textContent.includes(${JSON.stringify(
			token
		)})).length === 3`,
		{timeout: 15000, label: "three messages to tap"}
	);
	await page.sleep(400);

	const ids = await page.evaluate(
		`JSON.stringify(Array.from(document.querySelectorAll("#chat .msg")).filter((m) => m.textContent.includes(${JSON.stringify(
			token
		)})).map((m) => m.id))`
	);
	const [first, second] = JSON.parse(ids).map((id) => `#${id}`);

	// 1. A tap opens that message's toolbar, and it is really on screen —
	//    `actions-open` is only a class until the `hover: none` rule reveals
	//    the toolbar it names.
	await tap(page, `${first} .content`);
	await page.check(
		`a tap opens one toolbar (${JSON.stringify(await page.evaluate(OPEN))})`,
		JSON.parse(await page.evaluate(`JSON.stringify(${OPEN})`)).join() === first.slice(1)
	);

	const bar = await page.rect(`${first} .msg-actions`);
	await page.check(
		`the toolbar it names is visible (${JSON.stringify(bar)})`,
		bar && bar.width > 0 && bar.height > 0
	);
	await page.screenshot("1-first-open");

	// 2. The regression: tapping a second message must move the toolbar, not
	//    add one. Before the fix this left two open and a phone accumulated
	//    one per message tapped.
	await tap(page, `${second} .content`);

	const open = JSON.parse(await page.evaluate(`JSON.stringify(${OPEN})`));
	await page.check(
		`tapping another message moves the toolbar rather than adding one (${JSON.stringify(
			open
		)})`,
		open.length === 1 && open[0] === second.slice(1)
	);
	await page.check(
		"the first message's toolbar is gone",
		!(await page.evaluate(
			`document.querySelector(${JSON.stringify(first)}).classList.contains("actions-open")`
		))
	);
	await page.screenshot("2-moved-to-second");

	// 3. Tapping the open message again closes it, so a tap is a toggle and
	//    the scrollback can be left with nothing open.
	await tap(page, `${second} .content`);
	await page.check(
		"tapping the open message again closes it",
		JSON.parse(await page.evaluate(`JSON.stringify(${OPEN})`)).length === 0
	);
	await page.screenshot("3-closed-again");

	talker.quit();
}
