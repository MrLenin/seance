import {expect, test} from "@playwright/test";
import * as net from "node:net";

// A reply to a message the UI never loaded (older than the first page) or
// trimmed used to render "(unknown message)". The IRC layer now copies the
// parent's excerpt when it knows it, and fetches the parent alone (AROUND 1)
// when it does not; a parent the server has nothing for shows as
// "(message not available)" (docs/projects/reply-quote.md).
//
// Needs SEANCE_E2E_IRC_HOST/PORT (a PLAIN ws port), SEANCE_E2E_SASL_ACCOUNT/
// PASSWORD and SEANCE_E2E_SEED_HOST/PORT (plain TCP) to seed the channel.

const host = process.env.SEANCE_E2E_IRC_HOST;
const port = process.env.SEANCE_E2E_IRC_PORT ?? "8067";
const account = process.env.SEANCE_E2E_SASL_ACCOUNT ?? "";
const password = process.env.SEANCE_E2E_SASL_PASSWORD ?? "";
const seedHost = process.env.SEANCE_E2E_SEED_HOST ?? "127.0.0.1";
const seedPort = Number(process.env.SEANCE_E2E_SEED_PORT ?? "6667");
// Well over the 50-row first page: the parent is not loaded at connect time.
const ROWS = 120;
const PARENT_ROW = 3;

test.skip(!host || !account, "set SEANCE_E2E_IRC_HOST and SEANCE_E2E_SASL_ACCOUNT/PASSWORD");

const channel = `#e2equote-${Math.random().toString(36).slice(2, 8)}`;
let seedSocket: net.Socket | null = null;

test.afterEach(() => {
	seedSocket?.write("QUIT :seeded\r\n");
	seedSocket?.end();
	seedSocket = null;
});

/**
 * Seed ROWS lines, then two replies: one to row PARENT_ROW (its msgid read
 * from the echo), one to a msgid that does not exist.
 */
function seedHistory(): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = net.connect(seedPort, seedHost);
		let buf = "";
		let registered = false;
		let parentMsgid: string | undefined;
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

				const echo = /msgid=([^;\s]+).* PRIVMSG \S+ :row (\d+)$/.exec(line);

				if (echo && Number(echo[2]) === PARENT_ROW) {
					parentMsgid = echo[1];
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
								if (!parentMsgid) {
									reject(
										new Error(
											"the seed never saw its own echo for the parent row"
										)
									);
									return;
								}

								s.write(
									`@+draft/reply=${parentMsgid} PRIVMSG ${channel} :reply to an old row\r\n`
								);
								s.write(
									`@+draft/reply=nosuchmsgid PRIVMSG ${channel} :reply to nothing\r\n`
								);
								setTimeout(() => {
									seedSocket = s;
									resolve();
								}, 1500);
							}, 1500);
						}
					}, 12);
				}
			}
		});
		s.write(
			`CAP REQ :echo-message message-tags\r\nCAP END\r\nNICK ${nick}\r\nUSER e e e :seed\r\n`
		);
	});
}

test("replies quote parents the UI never loaded, and say when there is nothing", async ({page}) => {
	test.setTimeout(180_000);
	await seedHistory();
	const nick = `quote-e2e-${Math.floor(1000 + Math.random() * 9000)}`;
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
	await page.click("#connect form button[type=submit]");
	await page.waitForSelector(`#chat-container[data-current-channel="${channel}"]`, {
		timeout: 60_000,
	});
	await page.waitForSelector("#input:not([disabled])", {timeout: 60_000});

	const quoteTexts = () =>
		page.evaluate(() =>
			Array.from(document.querySelectorAll("#chat-container .msg-reply-quote")).map((el) =>
				(el as HTMLElement).innerText.replace(/\s+/g, " ").trim()
			)
		);

	// Both replies are in the first page; their parents are not.
	await expect.poll(async () => (await quoteTexts()).length, {timeout: 30_000}).toBe(2);
	// The old row's quote arrives by a fetch; the missing one is said to be missing.
	await expect
		.poll(async () => (await quoteTexts()).some((t) => t.includes(`row ${PARENT_ROW}`)), {
			timeout: 30_000,
			message: `no quote for row ${PARENT_ROW}: ${JSON.stringify(await quoteTexts())}`,
		})
		.toBe(true);
	await expect
		.poll(async () => (await quoteTexts()).some((t) => t.includes("(message not available)")), {
			timeout: 30_000,
			message: `no 'not available' quote: ${JSON.stringify(await quoteTexts())}`,
		})
		.toBe(true);
	expect((await quoteTexts()).some((t) => t.includes("(unknown message)"))).toBe(false);
});
