// Toggle a nefarious2 feature on the testnet ircd for one run — an oper
// with `set = yes` may `SET <feature> <value>` at runtime, and the cap
// features (`CAP_draft_read_marker`, …) announce themselves with CAP NEW /
// CAP DEL as they flip. A scenario that needs a cap the rig leaves off by
// default switches it on at the start and back at the end:
//
//   const was = await rigFeature("CAP_draft_read_marker", "TRUE");
//   try { … } finally { if (!was.before) await rigFeature("CAP_draft_read_marker", "FALSE"); }
//
// `before`/`after` report whether `cap` (when given) was in CAP LS before
// and after the SET, so the caller restores only what it changed. Node's
// global WebSocket (22+) is enough; no dependency.

const RIG = process.env.SEANCE_IRC_WS ?? "ws://127.0.0.1:8067/";
const OPER = process.env.SEANCE_OPER ?? "oper";
const OPER_PASSWORD = process.env.SEANCE_OPER_PASSWORD ?? "shmoo";

/**
 * @param {string} feature  e.g. "CAP_draft_read_marker"
 * @param {string} value    e.g. "TRUE"
 * @param {string} [cap]    the cap the feature governs, to report before/after
 * @returns {Promise<{before: boolean, after: boolean}>}
 */
export function rigFeature(feature, value, cap = capOf(feature)) {
	return new Promise((resolve, reject) => {
		const nick = "featset" + Math.random().toString(36).slice(2, 7);
		const ws = new WebSocket(RIG, "text.ircv3.net");
		const timer = setTimeout(() => fail(new Error(`rigFeature: no answer from ${RIG}`)), 15000);
		let stage = "register";
		let offered = [];
		let before = false;
		let settled = false;

		const fail = (err) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				ws.close();
				reject(err);
			}
		};

		const done = (after) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				ws.send("QUIT :done");
				setTimeout(() => ws.close(), 100);
				resolve({before, after});
			}
		};

		ws.onerror = () => fail(new Error(`rigFeature: could not reach ${RIG}`));
		ws.onclose = () => fail(new Error("rigFeature: the server closed the connection"));
		ws.onopen = () => {
			ws.send("NICK " + nick);
			ws.send("USER featset 0 * :feature toggle");
		};
		ws.onmessage = (e) => {
			const line = String(e.data);

			if (line.startsWith("PING")) {
				ws.send("PONG " + line.slice(5));
				return;
			}

			// `CAP * LS * :…` continues; the last line has no `*`.
			if (/ CAP \S+ LS /.test(line)) {
				const list = line.slice(line.indexOf(" :", line.indexOf(" LS ")) + 2).split(" ");
				offered = offered.concat(list.map((c) => c.split("=")[0]));

				if (/ LS \* :/.test(line)) {
					return;
				}

				const has = cap ? offered.includes(cap) : false;
				offered = [];

				if (stage === "before") {
					before = has;
					stage = "oper";
					ws.send(`OPER ${OPER} ${OPER_PASSWORD}`);
				} else if (stage === "after") {
					done(has);
				}

				return;
			}

			if (stage === "register" && /^\S+ (001|376|422) /.test(line)) {
				stage = "before";
				ws.send("CAP LS 302");
				return;
			}

			if (stage === "oper" && /^\S+ 381 /.test(line)) {
				stage = "set";
				ws.send(`SET ${feature} ${value}`);
				// The SET answers with a NOTICE; the CAP LS that follows is
				// processed after it, so it shows the new state.
				stage = "after";
				ws.send("CAP LS 302");
				return;
			}

			if (stage === "oper" && /^\S+ 491 /.test(line)) {
				fail(new Error("rigFeature: OPER refused (ERR_NOOPERHOST)"));
				return;
			}

			if (stage === "oper" && /^\S+ 464 /.test(line)) {
				fail(new Error("rigFeature: OPER refused (bad password)"));
			}
		};
	});
}

/** `CAP_draft_read_marker` → `draft/read-marker`; other features have no cap. */
function capOf(feature) {
	const m = /^CAP_(.+)$/.exec(feature);

	if (!m) {
		return undefined;
	}

	// The feature spells `/` and `-` as `_`; only the draft prefix has a `/`.
	return m[1].startsWith("draft_")
		? "draft/" + m[1].slice("draft_".length).replace(/_/g, "-")
		: m[1].replace(/_/g, "-");
}
