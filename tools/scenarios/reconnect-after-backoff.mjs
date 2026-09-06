// After a long absence the foreground poke must not leave the user waiting
// out the backoff that piled up while the app was away: a request to connect
// restarts the schedule (client/js/irc/transport.ts;
// docs/projects/seamless-reconnect.md § Round seven).
//
//   NODE_ENV=production corepack yarn build && python3 -m http.server -d public 8001 &
//   node tools/browser-drive.mjs tools/scenarios/reconnect-after-backoff.mjs [--chrome=…]
//
// Needs an ircd speaking plain WebSocket on 127.0.0.1:8067 (the dev ircd or
// the testnet). The page connects through a TCP proxy this scenario runs on
// PROXY_PORT, so the connection can be cut (what a phone's radio going away
// does to the socket), every dial refused for a while (the radio still off:
// the retries pile up), and then let through again. `SEANCE_URL` overrides
// where the built tree is served from.
//
// Claims:
//   1. the network registers through the proxy;
//   2. after the cut, the retries back off while dials are refused;
//   3. a foreground signal (window focus) dials at once;
//   4. when that dial fails too, the next wait is the first delay again, not
//      the one the retries had built up;
//   5. once dials go through again the network registers on the next retry;
//   6. no console errors.

import net from "node:net";

const HOST = process.env.SEANCE_URL ?? "http://127.0.0.1:8001";
const IRC = {host: "127.0.0.1", port: 8067};
const PROXY_PORT = 9874;
const NICK = "rc" + Math.random().toString(36).slice(2, 7);
/** Long enough for the schedule to reach a two-digit wait (1, 2, 4, 8, 16 → 32 s). */
const AWAY_MS = 36_000;

export const url = `${HOST}/?host=127.0.0.1&port=${PROXY_PORT}&tls=false&nick=${NICK}&join=%23seance`;

const LOBBY = ".channel-list-item[data-type='lobby']";
const LINES = `Array.from(document.querySelectorAll("#chat .msg")).map((m) => m.textContent.trim())`;

const pairs = new Set();
let accepting = true;

const proxy = net.createServer((socket) => {
	if (!accepting) {
		socket.destroy(); // the dial reaches nobody: a fast 1006 in the page
		return;
	}

	const backend = net.connect(IRC.port, IRC.host);
	const pair = {socket, backend};
	const gone = () => {
		pairs.delete(pair);
		socket.destroy();
		backend.destroy();
	};

	pairs.add(pair);
	socket.pipe(backend);
	backend.pipe(socket);
	socket.on("close", gone);
	backend.on("close", gone);
	socket.on("error", gone);
	backend.on("error", gone);
});

/** Drop every proxied connection without a word, like a radio going away. */
function cut() {
	for (const pair of pairs) {
		pair.socket.destroy();
		pair.backend.destroy();
	}

	pairs.clear();
}

/** The last "Reconnecting in Ns (attempt M)…" line the lobby shows, parsed. */
function lastWait(lines) {
	for (let i = lines.length - 1; i >= 0; i--) {
		const m = /Reconnecting in (\d+)s \(attempt (\d+)\)/.exec(lines[i]);

		if (m) {
			return {seconds: Number(m[1]), attempt: Number(m[2]), index: i};
		}
	}

	return null;
}

const registered = (page, since) =>
	page.wsFrames.slice(since).some((f) => f.dir === "in" && / 001 /.test(f.payloadData ?? ""));

async function until(page, fn, timeout, label) {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		if (fn()) {
			return;
		}

		await page.sleep(200);
	}

	throw new Error(`timed out waiting for ${label}`);
}

export default async function run(page) {
	await new Promise((resolve) => proxy.listen(PROXY_PORT, "127.0.0.1", resolve));

	try {
		await check(page);
	} finally {
		cut();
		proxy.close();
	}
}

async function check(page) {
	// 1. Connect through the proxy: the URL prefills the form, an unknown
	// server asks before connecting.
	await page.goto(page.url, {waitForSelector: "#connect form"});
	await page.click("#connect button[type=submit]");
	await page.waitFor(`document.querySelector("#chat .header")`, {
		timeout: 15000,
		label: "the chat",
	});
	await until(page, () => registered(page, 0), 20000, "registration through the proxy");
	page.check("1. registered through the proxy", registered(page, 0));
	await page.click(LOBBY); // the lobby is where the connection reports
	await page.screenshot("1-registered");

	// 2. The radio goes away: the socket is cut and every dial is refused
	// (those failed dials are the point, not a finding).
	accepting = false;
	page.expectWsErrors = true;
	cut();
	await page.sleep(AWAY_MS);
	let lines = await page.evaluate(LINES);
	const before = lastWait(lines);
	page.check(
		`2. the retries backed off while dials were refused (last wait ${before?.seconds}s, attempt ${before?.attempt})`,
		Boolean(before) && before.attempt >= 5 && before.seconds >= 10
	);
	await page.screenshot("2-away");

	// 3. The app comes back — a focus signal — while dials are still refused.
	const linesBefore = lines.length;
	await page.evaluate(`window.dispatchEvent(new Event("focus"))`);
	await page.waitFor(
		`/Connecting to 127\\.0\\.0\\.1:${PROXY_PORT}/.test((${LINES}).slice(${linesBefore}).join("\\n"))`,
		{timeout: 3000, label: "the foreground dial"}
	);
	page.check("3. the foreground signal dialled at once", true);

	// 4. Its failure schedules the next wait.
	await page.waitFor(
		`/Reconnecting in \\d+s/.test((${LINES}).slice(${linesBefore}).join("\\n"))`,
		{timeout: 5000, label: "the wait after the failed foreground dial"}
	);
	lines = await page.evaluate(LINES);
	const after = lastWait(lines);
	page.check(
		`4. the wait after the failed foreground dial is the first delay again (${after?.seconds}s, attempt ${after?.attempt}; it was ${before?.seconds}s)`,
		Boolean(after) && after.index >= linesBefore && after.seconds <= 2 && after.attempt === 1
	);
	await page.screenshot("3-poked");

	// 5. The radio is back: the next retry gets through.
	accepting = true;
	page.expectWsErrors = false;
	const frames = page.wsFrames.length;
	await until(page, () => registered(page, frames), 10000, "the re-registration");
	page.check("5. registered again on the next retry", registered(page, frames));
	await page.screenshot("4-back");

	page.check("6. no console errors", page.consoleErrors.length === 0);

	if (page.consoleErrors.length > 0) {
		console.log(page.consoleErrors);
	}
}
