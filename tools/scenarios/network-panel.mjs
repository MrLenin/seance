// The network header in the sidebar is two rows: the name alone on the first
// line (chevron, name, unread badge); on the second the tools (connection
// state, notifications, edit, join) on the left and the nick on the right
// (NetworkLobby.vue, the `.lobby-wrap` rules in style.css). What `yarn test`
// cannot see: that the name gets its whole line and is not clipped, that the
// tools sit under it as an evenly spaced toolbar with every glyph centred in
// its box, that the nick is the one the connection uses (and follows a /nick),
// that a long nick trims itself rather than pushing the tools, and how the
// header looks hovered, active, collapsed, disconnected and in the jump-to
// results.
//
//   corepack yarn build && python3 -m http.server -d public 8001 &
//   node tools/browser-drive.mjs tools/scenarios/network-panel.mjs
//
// The default target is a plain-WS ircd on 127.0.0.1:8067 (the testnet rig,
// or the dev ircd's ws:// port). Against the dev ircd over TLS:
//   node tools/browser-drive.mjs tools/scenarios/network-panel.mjs \
//     --url='http://localhost:8000/?host=localhost&port=8443&tls=true&nick=npanelcheck&join=%23seance'

const RUN = Date.now().toString(36);
const NICK = `np${RUN}`; // 10 characters: an ordinary nick, must fit whole
const LONG_NICK = `npanel${RUN}`; // 14: what the toolbar leaves no room for
const BASE = "http://localhost:8001/";

export const url = `${BASE}?host=127.0.0.1&port=8067&tls=false&nick=${NICK}&join=%23seance`;

const LOBBY = '.channel-list-item[data-type="lobby"]';
const CHANNEL_ROW = '.channel-list-item[data-name="#seance"]';
const TOOLS = [".connection-status-icon", ".notify-status-icon", ".edit-network", ".add-channel"];
const text = (selector) =>
	`(document.querySelector(${JSON.stringify(selector)})?.textContent ?? "").trim()`;
const NICK_SHOWN = `document.querySelector('${LOBBY} .lobby-nick').textContent.replace(/^\\s*Nickname:\\s*/, "").trim()`;

export default async function run(page) {
	const unclipped = (selector) =>
		page.evaluate(
			`(() => { const el = document.querySelector(${JSON.stringify(
				selector
			)}); return el.scrollWidth <= el.clientWidth; })()`
		);

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

	// Structure: two rows; every tool in the second one, before the nick.
	page.check("lobby has a title row", (await page.count(`${LOBBY} .lobby-title .name`)) === 1);
	page.check("lobby has a status row", (await page.count(`${LOBBY} .lobby-status`)) === 1);

	for (const tool of TOOLS) {
		page.check(
			`${tool} lives in the status row's toolbar`,
			(await page.count(`${LOBBY} .lobby-status .lobby-tools ${tool}`)) === 1
		);
	}

	page.check(
		"the title row carries no tool",
		(await page.count(`${LOBBY} .lobby-title button:not(.collapse-network)`)) === 0
	);
	page.check(
		"the toolbar comes before the nick",
		await page.evaluate(
			`(() => { const t = document.querySelector('${LOBBY} .lobby-tools'); const n = document.querySelector('${LOBBY} .lobby-nick'); return !!(t.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); })()`
		)
	);

	// Geometry: the name is on a line of its own, wide and unclipped; the
	// tools under it at the left, the nick on the same line at the right.
	const lobby = await page.rect(LOBBY);
	const name = await page.rect(`${LOBBY} .lobby-title .name`);
	const tools = await page.rect(`${LOBBY} .lobby-tools`);
	const nick = await page.rect(`${LOBBY} .lobby-nick`);
	page.check("header rects found", !!lobby && !!name && !!tools && !!nick);

	if (lobby && name && tools && nick) {
		const lobbyRight = lobby.x + lobby.width;
		const nickRight = nick.x + nick.width;
		page.check(`name spans its line (${Math.round(name.width)}px wide)`, name.width >= 120);
		page.check("tools sit below the name", tools.y >= name.y + name.height - 1);
		page.check(
			"nick and tools share a line",
			Math.abs(nick.y + nick.height / 2 - (tools.y + tools.height / 2)) <= 2
		);
		page.check(
			`tools start at the left edge (${Math.round(tools.x - lobby.x)}px in)`,
			tools.x - lobby.x >= 10 && tools.x - lobby.x <= 20
		);
		page.check(
			`nick ends at the right edge (${Math.round(lobbyRight - nickRight)}px from it)`,
			lobbyRight - nickRight >= 10 && lobbyRight - nickRight <= 20
		);
		page.check(`header height is modest (${Math.round(lobby.height)}px)`, lobby.height <= 60);
	}

	// The toolbar is evenly spaced: same box for every tool, same pitch
	// between neighbours, and each glyph centred in its box (the bell is a
	// span, which unlike a button does not centre its content on its own).
	const boxes = [];

	for (const tool of TOOLS) {
		boxes.push(await page.rect(`${LOBBY} .lobby-tools ${tool}`));
	}

	const widths = boxes.map((b) => Math.round(b.width));
	const pitches = boxes.slice(1).map((b, i) => Math.round((b.x - boxes[i].x) * 10) / 10);
	page.check(
		`every tool is the same box (${widths.join("/")}px)`,
		widths.every((w) => w === widths[0])
	);
	page.check(
		`tools are evenly pitched (${pitches.join("/")}px)`,
		pitches.every((p) => Math.abs(p - pitches[0]) <= 0.5)
	);
	page.check(
		"every tool box centres its glyph",
		await page.evaluate(
			`[${TOOLS.map((t) => JSON.stringify(`${LOBBY} .lobby-tools ${t}`)).join(
				","
			)}].every((s) => getComputedStyle(document.querySelector(s)).textAlign === "center")`
		)
	);

	page.check("name is not clipped", await unclipped(`${LOBBY} .lobby-title .name`));
	page.check("an ordinary nick is not clipped", await unclipped(`${LOBBY} .lobby-nick`));
	const shownName = await page.evaluate(text(`${LOBBY} .lobby-title .name`));
	page.check(`the title row shows the network name (${shownName})`, shownName.length > 0);

	// The nick shown is the nick the connection uses (the input's own label).
	const shownNick = await page.evaluate(NICK_SHOWN);
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

	// A nick change reaches the header, and a nick too long for the room the
	// toolbar leaves it trims itself instead of moving the tools.
	await page.fill("#input", `/nick ${LONG_NICK}`);
	await page.click("#submit");
	await page.waitFor(`${NICK_SHOWN} === ${JSON.stringify(LONG_NICK)}`, {
		timeout: 15000,
		label: "the header to show the new nick",
	});
	page.check(
		"the new nick matches the input's nick",
		LONG_NICK === (await page.evaluate(text("#nick")))
	);
	const toolsAfter = await page.rect(`${LOBBY} .lobby-tools`);
	page.check(
		"a long nick does not move the tools",
		!!toolsAfter &&
			Math.abs(toolsAfter.x - tools.x) < 1 &&
			Math.abs(toolsAfter.width - tools.width) < 1
	);
	page.check(
		"a long nick trims itself with an ellipsis",
		await page.evaluate(
			`getComputedStyle(document.querySelector('${LOBBY} .lobby-nick')).textOverflow === "ellipsis"`
		)
	);
	await page.screenshot("6-long-nick", {selector: "#sidebar"});

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
	await page.screenshot("7-disconnected", {selector: "#sidebar"});

	page.check("no console errors", page.consoleErrors.length === 0);
}
