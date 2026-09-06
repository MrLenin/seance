// The network header in the sidebar is three rows: the name alone on the first
// line (chevron, name, unread badge), the nick on the second, the tools
// (connection state, notifications, edit, join) as a right-aligned toolbar on
// the third (NetworkLobby.vue, the `.lobby-wrap` rules in style.css). What
// `yarn test` cannot see: that the name gets its whole line and is not
// clipped, that the nick and the tools sit under it in that order, that the
// nick shown is the one the connection uses, and how the header looks
// hovered, active, collapsed, disconnected and in the jump-to results.
//
//   corepack yarn build && python3 -m http.server -d public 8001 &
//   node tools/browser-drive.mjs tools/scenarios/network-panel.mjs
//
// The default target is a plain-WS ircd on 127.0.0.1:8067 (the testnet rig,
// or the dev ircd's ws:// port). Against the dev ircd over TLS:
//   node tools/browser-drive.mjs tools/scenarios/network-panel.mjs \
//     --url='http://localhost:8000/?host=localhost&port=8443&tls=true&nick=npanelcheck&join=%23seance'
//
// The nick is 14 characters on purpose: a nick that long was what the earlier
// two-row layout (nick and tools sharing a line) clipped to eight.

const RUN = Date.now().toString(36);
const NICK = `npanel${RUN}`;
const BASE = "http://localhost:8001/";

export const url = `${BASE}?host=127.0.0.1&port=8067&tls=false&nick=${NICK}&join=%23seance`;

const LOBBY = '.channel-list-item[data-type="lobby"]';
const CHANNEL_ROW = '.channel-list-item[data-name="#seance"]';
const text = (selector) =>
	`(document.querySelector(${JSON.stringify(selector)})?.textContent ?? "").trim()`;

export default async function run(page) {
	await page.goto(page.url, {waitForSelector: "#connect form"});
	await page.click("#connect button[type=submit]");
	await page.waitFor(`document.querySelector('${CHANNEL_ROW}')`, {
		timeout: 30000,
		label: "#seance in the sidebar",
	});
	await page.waitFor(`document.querySelector('${LOBBY} .connection-status-icon.is-connected')`, {
		timeout: 30000,
		label: "the lobby's status icon to show connected",
	});

	// Structure: three rows, every tool in the last one.
	page.check("lobby has a title row", (await page.count(`${LOBBY} .lobby-title .name`)) === 1);
	page.check("lobby has a nick row", (await page.count(`${LOBBY} .lobby-nick`)) === 1);
	page.check("lobby has a tools row", (await page.count(`${LOBBY} .lobby-tools`)) === 1);

	for (const tool of [
		".connection-status-icon",
		".notify-status-icon",
		".edit-network",
		".add-channel",
	]) {
		page.check(
			`${tool} lives in the tools block`,
			(await page.count(`${LOBBY} .lobby-tools ${tool}`)) === 1
		);
	}

	page.check(
		"the title row carries no tool",
		(await page.count(`${LOBBY} .lobby-title button:not(.collapse-network)`)) === 0
	);

	// Geometry: the name is on a line of its own, wide and unclipped; the nick
	// under it, unclipped too; the tools under both, flush right.
	const lobby = await page.rect(LOBBY);
	const name = await page.rect(`${LOBBY} .lobby-title .name`);
	const nick = await page.rect(`${LOBBY} .lobby-nick`);
	const tools = await page.rect(`${LOBBY} .lobby-tools`);
	page.check("header rects found", !!lobby && !!name && !!tools && !!nick);

	// The nick row is a block that carries its own indent, so its text starts
	// past its padding.
	const nickTextX = await page.evaluate(
		`(() => { const el = document.querySelector('${LOBBY} .lobby-nick'); return el.getBoundingClientRect().x + parseFloat(getComputedStyle(el).paddingLeft); })()`
	);

	if (lobby && name && tools && nick) {
		page.check(`name spans its line (${Math.round(name.width)}px wide)`, name.width >= 120);
		page.check("nick sits below the name", nick.y >= name.y + name.height - 1);
		page.check("nick starts under the name", Math.abs(nickTextX - name.x) <= 1);
		page.check("tools sit below the nick", tools.y >= nick.y + nick.height - 1);

		const toolsRight = tools.x + tools.width;
		const lobbyRight = lobby.x + lobby.width;
		page.check(
			`tools are flush right (${Math.round(lobbyRight - toolsRight)}px from the edge)`,
			lobbyRight - toolsRight >= 10 && lobbyRight - toolsRight <= 20
		);
		page.check(`header height is modest (${Math.round(lobby.height)}px)`, lobby.height <= 80);
	}

	const unclipped = (selector) =>
		page.evaluate(
			`(() => { const el = document.querySelector(${JSON.stringify(
				selector
			)}); return el.scrollWidth <= el.clientWidth; })()`
		);
	page.check("name is not clipped", await unclipped(`${LOBBY} .lobby-title .name`));
	page.check("nick is not clipped", await unclipped(`${LOBBY} .lobby-nick`));
	const shownName = await page.evaluate(text(`${LOBBY} .lobby-title .name`));
	page.check(`the title row shows the network name (${shownName})`, shownName.length > 0);

	// The nick shown is the nick the connection uses (the input's own label).
	const shownNick = await page.evaluate(
		`document.querySelector('${LOBBY} .lobby-nick').textContent.replace(/^\\s*Nickname:\\s*/, "").trim()`
	);
	page.check(`status row shows the nick (${shownNick})`, shownNick === NICK);
	page.check(
		"status row nick matches the input's nick",
		shownNick === (await page.evaluate(text("#nick")))
	);

	await page.screenshot("1-channel-active", {selector: "#sidebar"});

	await page.hover(LOBBY);
	await page.screenshot("2-lobby-hovered", {selector: "#sidebar"});

	await page.click(`${LOBBY} .lobby-title .name`);
	await page.waitFor(`document.querySelector('${LOBBY}.active')`, {label: "lobby to be active"});
	await page.screenshot("3-lobby-active", {selector: "#sidebar"});

	await page.click(`${LOBBY} .collapse-network`);
	await page.waitFor(`!document.querySelector('${CHANNEL_ROW}')`, {
		label: "channels to collapse",
	});
	await page.screenshot("4-collapsed", {selector: "#sidebar"});
	await page.click(`${LOBBY} .collapse-network`);
	await page.waitFor(`document.querySelector('${CHANNEL_ROW}')`, {label: "channels to expand"});

	// Jump-to results render the same header next to the server glyph. The
	// results leave out the open conversation, so open the channel first.
	await page.click(CHANNEL_ROW);
	await page.waitFor(`document.querySelector('${CHANNEL_ROW}.active')`, {
		label: "channel to be active again",
	});
	await page.click("#channel-search-input");
	await page.fill("#channel-search-input", shownName.slice(0, 3));
	await page.waitFor(`document.querySelector('.jump-to-results ${LOBBY}')`, {
		label: "the lobby among the jump-to results",
	});
	page.check(
		"results keep the nick",
		(await page.count(`.jump-to-results ${LOBBY} .lobby-nick`)) === 1
	);
	page.check(
		"results hide the toolbar",
		await page.evaluate(
			`getComputedStyle(document.querySelector('.jump-to-results ${LOBBY} .lobby-tools')).display === "none"`
		)
	);
	await page.screenshot("5-jump-to-results", {selector: "#sidebar"});
	await page.fill("#channel-search-input", "");
	await page.evaluate(`document.querySelector("#channel-search-input").blur()`);
	await page.waitFor(`!document.querySelector('.jump-to-results')`, {label: "results to close"});

	// Disconnected: the header turns red, the status icon shows unlink. The
	// ircd answers the QUIT with a close frame and then its ERROR line, which
	// Chrome reports as a socket error ("Data frame received after close");
	// that is the server's close handshake, not the sidebar's business.
	page.expectWsErrors = true;
	await page.fill("#input", "/disconnect");
	await page.click("#submit");
	await page.waitFor(`document.querySelector('${LOBBY}.not-connected')`, {
		timeout: 15000,
		label: "the lobby to show disconnected",
	});
	await page.sleep(300);
	page.check(
		"disconnected status icon",
		(await page.count(`${LOBBY} .lobby-tools .connection-status-icon.is-disconnected`)) === 1
	);
	page.check("nick survives the disconnect", (await page.count(`${LOBBY} .lobby-nick`)) === 1);
	await page.screenshot("6-disconnected", {selector: "#sidebar"});

	page.check("no console errors", page.consoleErrors.length === 0);
}
