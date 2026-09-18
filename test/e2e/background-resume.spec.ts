import {expect, test, type Page} from "@playwright/test";
import * as net from "node:net";

// A PWA that was backgrounded: the OS kills the socket while the page is
// hidden, the page comes back, Seance reconnects (bouncer revive), and
// paging history must keep working exactly as before. Field report
// 2026-09-16: "after the pwa has been backgrounded, history retrieval
// doesn't always work correctly anymore; restart it and it works".
//
// The case that broke: the page comes back and the user scrolls up at once,
// while the transport still believes its dead socket is open (the probe
// window). The CHATHISTORY request goes into the dead socket; when the
// transport gives up, the pending request is answered with an empty page,
// which leaves the view at the top of the buffer with the button visible —
// and at the top there is no scroll left to make it ask again. The IRC
// layer now re-asks such a page once the channel is back.
//
// Needs SEANCE_E2E_IRC_HOST/PORT (a PLAIN ws port), SEANCE_E2E_SASL_ACCOUNT/
// PASSWORD (a bouncer account so the session survives the drop) and
// SEANCE_E2E_SEED_HOST/PORT (plain TCP) to seed the channel.

const host = process.env.SEANCE_E2E_IRC_HOST;
const port = process.env.SEANCE_E2E_IRC_PORT ?? "8067";
const account = process.env.SEANCE_E2E_SASL_ACCOUNT ?? "";
const password = process.env.SEANCE_E2E_SASL_PASSWORD ?? "";
const seedHost = process.env.SEANCE_E2E_SEED_HOST ?? "127.0.0.1";
const seedPort = Number(process.env.SEANCE_E2E_SEED_PORT ?? "6667");
// Three background cycles each cost two pages (the one lost with the socket
// and the one paged afterwards): 49 + 3 * 200 must stay below the seed.
const ROWS = 700;

test.skip(!host || !account, "set SEANCE_E2E_IRC_HOST and SEANCE_E2E_SASL_ACCOUNT/PASSWORD");

const channel = `#e2ebg-${Math.random().toString(36).slice(2, 8)}`;
let seedSocket: net.Socket | null = null;
/** Another client of the same account, connected throughout (the phone is a bouncer alias beside it). */
let companion: net.Socket | null = null;

/**
 * The wire signature of the stall of 2026-09-18: the same `CHATHISTORY
 * BEFORE <target> <ref>` asked again and again, because the page was
 * anchored on a local line at the top of the buffer (stamped with the
 * connect time) rather than on the oldest message held, so it brought
 * back only rows already shown. Every page a flow asks for must reference
 * something new. Collected by connectAndSeed's frame hook, checked after
 * each test.
 */
const pagesAsked = new Set<string>();
const repeatedPages: string[] = [];

function notePageAsked(payload: string): void {
	const m = /CHATHISTORY BEFORE (\S+) (\S+) \d+/.exec(payload);

	if (!m) {
		return;
	}

	const key = `${m[1]} ${m[2]}`;

	if (pagesAsked.has(key)) {
		repeatedPages.push(key);
	}

	pagesAsked.add(key);
}

test.beforeEach(() => {
	pagesAsked.clear();
	repeatedPages.length = 0;
});

test.afterEach(() => {
	seedSocket?.write("QUIT :seeded\r\n");
	seedSocket?.end();
	seedSocket = null;
	companion?.write("QUIT :done\r\n");
	companion?.end();
	companion = null;
	expect(repeatedPages, "a page was asked for twice with the same reference").toEqual([]);
});

function seedHistory(): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = net.connect(seedPort, seedHost);
		let buf = "";
		let registered = false;
		const nick = `seed${Math.floor(1000 + Math.random() * 9000)}`;
		s.setEncoding("utf8");
		s.on("error", reject);
		s.on("data", (d: string) => {
			buf += d;
			let i: number;

			while ((i = buf.indexOf("\r\n")) >= 0) {
				const line = buf.slice(0, i);
				buf = buf.slice(i + 2);

				if (line.startsWith("PING")) {
					s.write(`PONG ${line.slice(5)}\r\n`);
				}

				if (!registered && / 001 /.test(line)) {
					registered = true;
					s.write(`JOIN ${channel}\r\n`);
					let n = 0;
					const tick = setInterval(() => {
						s.write(`PRIVMSG ${channel} :row ${n}\r\n`);

						if (++n >= ROWS) {
							clearInterval(tick);
							setTimeout(() => {
								seedSocket = s;
								resolve();
							}, 1500);
						}
					}, 12);
				}
			}
		});
		s.write(`NICK ${nick}\r\nUSER e e e :seed\r\n`);
	});
}

/** The seeded row numbers shown, in display order. */
async function rows(page: Page): Promise<number[]> {
	return page.evaluate(() =>
		Array.from(document.querySelectorAll('#chat-container .msg[data-type="message"] .content'))
			.map((el) => /row (\d+)/.exec((el as HTMLElement).innerText)?.[1])
			.filter((x): x is string => x !== undefined)
			.map(Number)
	);
}

function setVisible(page: Page, v: boolean) {
	return page.evaluate((vis) => {
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => (vis ? "visible" : "hidden"),
		});
		Object.defineProperty(document, "hidden", {configurable: true, get: () => !vis});
		document.hasFocus = () => vis;
		document.dispatchEvent(new Event("visibilitychange"));
		window.dispatchEvent(new Event(vis ? "focus" : "blur"));
	}, v);
}

function scrollTo(page: Page, top: number) {
	return page.evaluate((t) => {
		(document.querySelector(".chat") as HTMLElement).scrollTop = t;
	}, top);
}

function showMoreVisible(page: Page) {
	return page.evaluate(() => {
		const b = document.querySelector(".show-more") as HTMLElement | null;
		return b ? getComputedStyle(b).display !== "none" : false;
	});
}

/**
 * Connect with the bouncer account, seed the channel, wait for the first
 * page. `wire` collects the history-related frames of every socket the page
 * opens, for the failure messages.
 */
async function connectAndSeed(page: Page, wire: string[], remember = false): Promise<number[]> {
	page.on("websocket", (ws) => {
		ws.on("framesent", (f) => {
			const p = String(f.payload);

			if (/CHATHISTORY|PERSISTENCE|JOIN|AUTHENTICATE/i.test(p)) {
				wire.push(`> ${p.slice(0, 90)}`);
			}

			notePageAsked(p);
		});
		ws.on("framereceived", (f) => {
			const p = String(f.payload);

			if (
				/BATCH [+-]|FAIL|chathistory| 001 | JOIN /i.test(p) &&
				!/PRIVMSG .* :row /.test(p)
			) {
				wire.push(`< ${p.slice(0, 120)}`);
			}
		});
	});
	// Keep every WebSocket the app opens reachable from the test.
	await page.addInitScript(() => {
		const list: WebSocket[] = [];
		(window as any).__ws = list;
		const Orig = window.WebSocket;
		const Wrapped = function (this: any, url: string | URL, protocols?: string | string[]) {
			const s = protocols === undefined ? new Orig(url) : new Orig(url, protocols);
			// Every "message" listener the app adds is wrapped so the test can
			// silence inbound data later (a socket the OS killed delivers nothing).
			const origAdd = s.addEventListener.bind(s);

			(s as any).addEventListener = (type: string, fn: any, opts?: any) => {
				if (type !== "message") {
					return origAdd(type, fn, opts);
				}

				return origAdd(
					type,
					(ev: Event) => {
						if (!(s as any).__dead) {
							fn(ev);
						}
					},
					opts
				);
			};

			list.push(s);
			return s;
		} as unknown as typeof WebSocket;
		Wrapped.prototype = Orig.prototype;
		Object.defineProperties(Wrapped, {
			CONNECTING: {value: 0},
			OPEN: {value: 1},
			CLOSING: {value: 2},
			CLOSED: {value: 3},
		});
		window.WebSocket = Wrapped;
	});

	await seedHistory();
	const nick = `bg-e2e-${Math.floor(1000 + Math.random() * 9000)}`;
	await page.goto("/");
	await page.waitForSelector("#connect");
	await page.fill("#connect\\:host", host!);
	await page.fill("#connect\\:port", port);

	if (await page.isChecked("#connect input[name=tls]")) {
		await page.uncheck("#connect input[name=tls]");
	}

	await page.fill("#connect\\:nick", nick);
	await page.fill("#connect\\:channels", channel);
	await page.check("#connect input[name=sasl]");
	await page.fill("#connect\\:saslAccount", account);
	await page.fill("#connect\\:saslPassword", password);

	if (remember) {
		// Saved with its password and autoconnect, the way the phone's is:
		// a reloaded page then reconnects by itself.
		await page.check("#connect input[name=rememberPassword]");
		await page.check("#connect input[name=autoconnect]");
	}

	await page.click("#connect form button[type=submit]");
	await page.waitForSelector(`#chat-container[data-current-channel="${channel}"]`, {
		timeout: 60_000,
	});
	await page.waitForSelector("#input:not([disabled])", {timeout: 60_000});
	await expect
		.poll(async () => (await rows(page)).length, {timeout: 30_000})
		.toBeGreaterThanOrEqual(40);
	return rows(page);
}

/** The OS killed the socket: nothing goes out, nothing comes in, no close event. */
function deadenSocket(page: Page) {
	return page.evaluate(() => {
		const list = (window as any).__ws as WebSocket[];
		const s = list[list.length - 1];
		s.send = () => undefined;
		(s as any).__dead = true;
	});
}

function socketCount(page: Page) {
	return page.evaluate(() => ((window as any).__ws as WebSocket[]).length);
}

/** Wait until the app has opened a new socket beyond `n` and it is OPEN. */
function waitForNewSocket(page: Page, n: number, timeout: number) {
	return page.waitForFunction(
		(count) => {
			const list = (window as any).__ws as WebSocket[];
			return list.length > count && list[list.length - 1].readyState === 1;
		},
		n,
		{timeout}
	);
}

function closeSocket(page: Page) {
	return page.evaluate(() => {
		const list = (window as any).__ws as WebSocket[];
		list[list.length - 1].close();
	});
}

/** A page of history must prepend older rows, never duplicate, never append. */
/**
 * A second client of the bouncer account, logged in over plain TCP with
 * SASL PLAIN and joined to the channel, that stays for the whole test: the
 * browser is then a bouncer alias beside it, as the phone is beside a
 * desktop client. Resolves once it is in the channel.
 */
function companionJoins(): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = net.connect(seedPort, seedHost);
		let buf = "";
		const nick = `mate${Math.floor(1000 + Math.random() * 9000)}`;
		const creds = Buffer.from(`\0${account}\0${password}`).toString("base64");
		s.setEncoding("utf8");
		s.on("error", reject);
		s.on("data", (d: string) => {
			buf += d;
			let i: number;

			while ((i = buf.indexOf("\r\n")) >= 0) {
				const line = buf.slice(0, i);
				buf = buf.slice(i + 2);

				if (line.startsWith("PING")) {
					s.write(`PONG ${line.slice(5)}\r\n`);
				} else if (/ CAP \S+ ACK :.*sasl/.test(line)) {
					s.write("AUTHENTICATE PLAIN\r\n");
				} else if (line === "AUTHENTICATE +") {
					s.write(`AUTHENTICATE ${creds}\r\n`);
				} else if (/ 903 /.test(line)) {
					s.write("CAP END\r\n");
				} else if (/ 90[45] /.test(line)) {
					reject(new Error(`companion SASL failed: ${line}`));
				} else if (/ 001 /.test(line)) {
					s.write(`JOIN ${channel}\r\n`);
				} else if (new RegExp(`^:\\S+ JOIN :?${channel}$`, "i").test(line)) {
					// Our own join (a revived session may have renamed us).
					companion = s;
					resolve();
				}
			}
		});
		s.write(`CAP REQ :sasl\r\nNICK ${nick}\r\nUSER c c c :companion\r\n`);
	});
}

/** More rows from the seed while the app is away, numbered on from the last. */
function seedMore(n: number): Promise<void> {
	return new Promise((resolve) => {
		let i = 0;
		const tick = setInterval(() => {
			seedSocket?.write(`PRIVMSG ${channel} :row ${ROWS + i}\r\n`);

			if (++i >= n) {
				clearInterval(tick);
				setTimeout(resolve, 1500);
			}
		}, 12);
	});
}

function expectPaged(now: number[], prev: number[], label: string): void {
	expect(now[now.length - 1], `${label}: the newest row changed`).toBe(prev[prev.length - 1]);
	expect(now[0], `${label}: nothing older was prepended`).toBeLessThan(prev[0]);
	expect(new Set(now).size, `${label}: duplicate rows`).toBe(now.length);

	for (let i = 1; i < now.length; i++) {
		expect(now[i], `${label}: order broken at ${i}`).toBe(now[i - 1] + 1);
	}
}

async function pageTwice(page: Page, start: number[]) {
	let prev = start;

	for (let round = 1; round <= 2; round++) {
		await scrollTo(page, 0);
		await expect
			.poll(async () => (await rows(page)).length, {
				timeout: 25_000,
				message: `round ${round}: no rows arrived`,
			})
			.toBeGreaterThan(prev.length);
		await page.waitForTimeout(800);
		const now = await rows(page);
		expectPaged(now, prev, `round ${round}`);
		prev = now;
	}
}

test("history paging still works after a clean socket close while hidden", async ({page}) => {
	test.setTimeout(240_000);
	const wire: string[] = [];
	await connectAndSeed(page, wire);
	await setVisible(page, false);
	await page.waitForTimeout(1500);
	const n = await socketCount(page);
	await closeSocket(page);
	await page.waitForTimeout(3000);
	await setVisible(page, true);
	await waitForNewSocket(page, n, 90_000);
	await page.waitForSelector("#input:not([disabled])", {timeout: 90_000});
	await page.waitForTimeout(3000);
	await pageTwice(page, await rows(page));
});

test("history paging still works after the socket silently died while hidden (probe path)", async ({
	page,
}) => {
	test.setTimeout(300_000);
	const wire: string[] = [];
	await connectAndSeed(page, wire);
	await setVisible(page, false);
	await page.waitForTimeout(1500);
	const n = await socketCount(page);
	await deadenSocket(page);
	await page.waitForTimeout(3000);
	// Foreground: the transport still thinks it is open; wake() probes it and
	// gives up after PROBE_TIMEOUT_MS, then redials.
	await setVisible(page, true);
	await waitForNewSocket(page, n, 120_000);
	await page.waitForSelector("#input:not([disabled])", {timeout: 90_000});
	await page.waitForTimeout(3000);
	await pageTwice(page, await rows(page));
});

test("scrolling up while the reconnect is still in progress loads the page once back", async ({
	page,
}) => {
	test.setTimeout(300_000);
	const wire: string[] = [];
	const before = await connectAndSeed(page, wire);
	await setVisible(page, false);
	await page.waitForTimeout(1500);
	const n = await socketCount(page);
	await deadenSocket(page);
	await page.waitForTimeout(2000);
	await setVisible(page, true);
	// The probe gives up and the transport redials: the button is in view but
	// disabled (not connected) while the new socket registers.
	await page.waitForFunction((count) => ((window as any).__ws as WebSocket[]).length > count, n, {
		timeout: 120_000,
	});
	await scrollTo(page, 0);
	await page.waitForTimeout(300);
	await page.waitForSelector("#input:not([disabled])", {timeout: 90_000});

	// The user asked; once the channel is back the page must come without
	// another gesture (at the top there is no scroll left to give).
	const dump = async () =>
		page.evaluate(() => {
			const el = document.querySelector(".chat") as HTMLElement;
			const b = document.querySelector(".show-more button") as HTMLButtonElement | null;
			const sm = document.querySelector(".show-more") as HTMLElement | null;
			return JSON.stringify({
				scrollTop: el.scrollTop,
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
				showMore: sm ? getComputedStyle(sm).display : "absent",
				button: b ? {disabled: b.disabled, text: b.innerText} : null,
				input: (document.querySelector("#input") as HTMLInputElement).disabled,
				msgs: document.querySelectorAll("#chat-container .msg").length,
			});
		});
	await expect
		.poll(async () => (await rows(page))[0], {
			timeout: 30_000,
			message: `no page after the reconnect\n${await dump()}\n${wire.join("\n")}`,
		})
		.toBeLessThan(before[0]);
	await page.waitForTimeout(1500);
	const after = await rows(page);
	expectPaged(after, before, "after reconnect");
	await pageTwice(page, after);
});

test("scrolling up right after resume, over three background cycles, keeps paging alive", async ({
	page,
}) => {
	test.setTimeout(420_000);
	const wire: string[] = [];
	let prev = await connectAndSeed(page, wire);

	for (let cycle = 1; cycle <= 3; cycle++) {
		await setVisible(page, false);
		await page.waitForTimeout(1500);
		const n = await socketCount(page);
		await deadenSocket(page);
		await page.waitForTimeout(2000);
		await setVisible(page, true);
		// The phone's move: scroll up at once, while the transport still
		// believes the dead socket is open (probe window). The request goes
		// into the dead socket.
		await scrollTo(page, 0);
		await page.waitForTimeout(1000);
		await waitForNewSocket(page, n, 120_000);
		await page.waitForSelector("#input:not([disabled])", {timeout: 90_000});

		// The lost page arrives by itself once the channel is back.
		await expect
			.poll(async () => (await rows(page))[0], {
				timeout: 30_000,
				message: `cycle ${cycle}: the page lost with the socket never came\n${wire.join(
					"\n"
				)}`,
			})
			.toBeLessThan(prev[0]);
		await page.waitForTimeout(1500);
		const after = await rows(page);
		expectPaged(after, prev, `cycle ${cycle}: after reconnect`);
		expect(await showMoreVisible(page), `cycle ${cycle}: the show-more button vanished`).toBe(
			true
		);

		// And paging on from there still works.
		await scrollTo(page, 0);
		await expect
			.poll(async () => (await rows(page))[0], {
				timeout: 30_000,
				message: `cycle ${cycle}: no older rows arrived\n${wire.join("\n")}`,
			})
			.toBeLessThan(after[0]);
		await page.waitForTimeout(800);
		const now = await rows(page);
		expectPaged(now, after, `cycle ${cycle}: paged`);
		prev = now;
	}
});

// The case that took twelve hours to show itself on the phone (2026-09-18):
// iOS evicted the PWA and RELOADED it on return. A reloaded page starts
// with empty buffers; the saved network reconnects, the stored cursor makes
// the server replay what landed meanwhile, and those rows are appended
// under whatever the connect pushed first, a local line stamped with the
// connect time. A page anchored on that line asks for the newest rows,
// which are the ones just shown, and the same page is asked for forever.
//
// Honest note: on the bed the reloaded page's top row is a real message,
// even as a bouncer alias beside a companion client, so this flow passed
// before the fix too; whatever line the phone had on top of #afternet
// (a services notice into the channel at join is the likely one) is not
// reproduced here. The unit tests in test/irc/history.ts pin the
// mechanism; this keeps the reload-as-alias flow and the "no page asked
// twice" check (afterEach) exercised on a real server.
test("a reload while away (iOS reloading the PWA) pages on from the oldest message, not the connect time", async ({
	page,
}) => {
	test.setTimeout(300_000);
	const wire: string[] = [];
	// The desktop client stays; the browser is an alias beside it, as the
	// phone is: its rejoin after the reload pushes its own join lines.
	await companionJoins();
	await connectAndSeed(page, wire, true);

	// Rows land while the app is gone.
	await seedMore(120);
	await page.reload();
	await page.waitForSelector("#input:not([disabled])", {timeout: 90_000});

	if (!(await page.$(`#chat-container[data-current-channel="${channel}"]`))) {
		await page.click(`[data-name="${channel}"]`);
		await page.waitForSelector(`#chat-container[data-current-channel="${channel}"]`, {
			timeout: 30_000,
		});
	}

	// The rows that landed while away arrive by the replay (or a catch-up),
	// appended: the newest of them closes the buffer.
	await expect
		.poll(async () => (await rows(page)).at(-1), {
			timeout: 60_000,
			message: `the rows from while away never came\n${wire.join("\n")}`,
		})
		.toBe(ROWS + 119);
	await page.waitForTimeout(1500);
	const after = await rows(page);

	// Scrolling up must bring rows older than everything shown, not the
	// page just shown again (afterEach also checks no page is asked twice).
	await scrollTo(page, 0);
	await expect
		.poll(async () => (await rows(page))[0], {
			timeout: 30_000,
			message: `no older rows arrived after the reload\n${wire.join("\n")}`,
		})
		.toBeLessThan(after[0]);
	await page.waitForTimeout(800);
	expectPaged(await rows(page), after, "after the reload");
});
