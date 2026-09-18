/**
 * Reply quotes for parents the UI does not hold (docs/projects/reply-quote.md).
 *
 * Every message handed to the UI leaves an excerpt in its channel's quote
 * cache ({@link Channel.noteQuote}); a reply whose parent is cached is
 * delivered with `replyQuote` on it. For the rest the UI asks (`quote:fetch`)
 * and {@link requestQuote} fetches the parent alone with
 * `CHATHISTORY AROUND <chan> msgid=<parent> 1`: one request per distinct
 * parent, one in flight per client, {@link QUOTE_FETCH_GAP_MS} between
 * them. The answer — or its absence — is cached and dispatched as
 * `msg:quote` for every reply in the channel naming that parent.
 */

import type {ReplyQuote} from "../../../shared/types/msg";
import type {Channel} from "./channel";
import type {IrcClient} from "./client";
import {requestHistory} from "./history";
import type {IrcMessage} from "./message";

/** Longest excerpt a quote shows. */
export const QUOTE_MAX_LENGTH = 80;
/** Excerpts kept per channel; the oldest go first. */
export const QUOTE_CACHE_MAX = 2000;
/** Pause between two parent fetches for the same client. */
export const QUOTE_FETCH_GAP_MS = 250;

const ACTION_PREFIX = "\x01ACTION ";

/** One line of the parent, whitespace collapsed, cut to the quote length. */
export function excerpt(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > QUOTE_MAX_LENGTH ? flat.slice(0, QUOTE_MAX_LENGTH - 1) + "…" : flat;
}

interface QuoteQueue {
	/** Parents asked for, in order, not yet sent. */
	waiting: {chan: Channel; msgid: string}[];
	/** The parent whose request is out. */
	inFlight: string | undefined;
	timer: ReturnType<typeof setTimeout> | null;
}

const queues = new WeakMap<IrcClient, QuoteQueue>();

function queueOf(client: IrcClient): QuoteQueue {
	let q = queues.get(client);

	if (!q) {
		q = {waiting: [], inFlight: undefined, timer: null};
		queues.set(client, q);
	}

	return q;
}

/** Parents waiting or in flight for `client` (tests / diagnostics). */
export function pendingQuotes(client: IrcClient): string[] {
	const q = queueOf(client);
	return [...(q.inFlight ? [q.inFlight] : []), ...q.waiting.map((w) => w.msgid)];
}

function announce(client: IrcClient, chan: Channel, msgid: string, quote: ReplyQuote): void {
	client.dispatch("msg:quote", {chan: chan.id, msgid, quote});
}

/**
 * The UI rendered a reply it has no quote for. A cached answer (a parent
 * seen since, or one already found missing) is dispatched at once; anything
 * else joins the queue.
 */
export function requestQuote(client: IrcClient, chan: Channel, msgid: string): void {
	const cached = chan.quoteOf(msgid);

	if (cached) {
		announce(client, chan, msgid, cached);
		return;
	}

	const q = queueOf(client);

	if (q.inFlight === msgid || q.waiting.some((w) => w.msgid === msgid)) {
		return;
	}

	q.waiting.push({chan, msgid});
	pump(client, q);
}

function pump(client: IrcClient, q: QuoteQueue): void {
	if (q.inFlight !== undefined || q.timer !== null) {
		return;
	}

	const next = q.waiting.shift();

	if (!next) {
		return;
	}

	const sent = requestHistory(client, next.chan, {
		subcommand: "AROUND",
		ref: {msgid: next.msgid, time: new Date(0)},
		limit: 1,
		mode: "quote",
		quote: next.msgid,
	});

	if (!sent) {
		// Not connected, or no history here: left for a later render.
		pump(client, q);
		return;
	}

	q.inFlight = next.msgid;
}

/** Transport closed: whatever was queued is asked again when rendered. */
export function resetQuotes(client: IrcClient): void {
	const q = queueOf(client);
	q.waiting = [];
	q.inFlight = undefined;

	if (q.timer !== null) {
		clearTimeout(q.timer);
		q.timer = null;
	}
}

/**
 * The answer to a quote request: the parent's line (the first PRIVMSG or
 * NOTICE of the page), nothing (`[]` — the server has no such message for
 * us: the presence filter, or one it never stored), or `null` for a
 * timeout, which is not cached so a later render may try again.
 */
export function resolveQuote(
	client: IrcClient,
	chan: Channel,
	msgid: string,
	lines: IrcMessage[] | null
): void {
	const q = queueOf(client);

	if (q.inFlight === msgid) {
		q.inFlight = undefined;
		q.timer = setTimeout(() => {
			q.timer = null;
			pump(client, q);
		}, QUOTE_FETCH_GAP_MS);
	}

	if (lines === null) {
		return;
	}

	const parent = lines.find(
		(line) =>
			(line.command === "PRIVMSG" || line.command === "NOTICE") &&
			(!line.tags.get("msgid") || line.tags.get("msgid") === msgid)
	);
	let quote: ReplyQuote;

	if (parent) {
		let text = parent.params[parent.params.length - 1] ?? "";

		if (text.startsWith(ACTION_PREFIX)) {
			text = text.slice(ACTION_PREFIX.length).replace(/\x01$/, "");
		}

		quote = {nick: parent.source?.name ?? "", text: excerpt(text)};
	} else {
		quote = {unavailable: true};
	}

	chan.noteQuoteResolved(msgid, quote);
	announce(client, chan, msgid, quote);
}
