import {expect} from "chai";
import sinon from "ts-sinon";
import {HISTORY_TIMEOUT_MS} from "../../client/js/irc/history";
import {
	QUOTE_FETCH_GAP_MS,
	QUOTE_MAX_LENGTH,
	pendingQuotes,
	requestQuote,
} from "../../client/js/irc/quotes";
import type {ReplyQuote, SharedMsg} from "../../shared/types/msg";
import {Harness, batch, joined, labelOf, setup} from "./support";

interface QuotePayload {
	chan: number;
	msgid: string;
	quote: ReplyQuote;
}

function line(h: Harness, msgid: string, nick: string, text: string, tags = ""): void {
	h.transport.line(
		`@${
			tags ? tags + ";" : ""
		}msgid=${msgid};time=2026-08-25T12:01:00.000Z :${nick}!${nick}@host PRIVMSG #seance :${text}`
	);
}

function messageWith(h: Harness, msgid: string): SharedMsg {
	const found = h.payloads<{msg: SharedMsg}>("msg").find((p) => p.msg.msgid === msgid);
	expect(found, `no msg dispatched for ${msgid}`).to.not.equal(undefined);
	return found!.msg;
}

function quotes(h: Harness): QuotePayload[] {
	return h.payloads<QuotePayload>("msg:quote");
}

describe("reply quotes (irc/quotes.ts)", function () {
	let clock: sinon.SinonFakeTimers;

	beforeEach(function () {
		clock = sinon.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
	});

	afterEach(function () {
		clock.restore();
	});

	describe("copied at arrival", function () {
		it("a reply to a message shown earlier carries what it said", function () {
			const h = setup();
			joined(h);
			line(h, "p1", "bob", "the parent text");
			line(h, "r1", "carol", "the reply", "+draft/reply=p1");

			expect(messageWith(h, "r1").replyQuote).to.deep.equal({
				nick: "bob",
				text: "the parent text",
			});
		});

		it("cuts a long parent to the quote length, whitespace collapsed", function () {
			const h = setup();
			joined(h);
			line(h, "p1", "bob", "a  b\t c " + "x".repeat(200));
			line(h, "r1", "carol", "reply", "+draft/reply=p1");
			const quote = messageWith(h, "r1").replyQuote as {text: string};

			expect(quote.text).to.have.length(QUOTE_MAX_LENGTH);
			expect(quote.text.startsWith("a b c x")).to.equal(true);
			expect(quote.text.endsWith("…")).to.equal(true);
		});

		it("a reply to a parent never seen carries no quote", function () {
			const h = setup();
			joined(h);
			line(h, "r1", "carol", "reply", "+draft/reply=never");

			expect(messageWith(h, "r1").replyQuote).to.equal(undefined);
		});

		it("the copy of our own reply carries the quote too", function () {
			const h = setup();
			joined(h);
			line(h, "p1", "bob", "the parent text");
			h.client.sendMessage("#seance", "my reply", {tags: {"+draft/reply": "p1"}});
			const copy = h.payloads<{msg: SharedMsg}>("msg").find((p) => p.msg.pending);

			expect(copy?.msg.replyQuote).to.deep.equal({nick: "bob", text: "the parent text"});
		});
	});

	describe("fetched on demand", function () {
		it("asks for the parent alone, and answers every reply to it", function () {
			const h = setup();
			const id = joined(h);
			const chan = h.client.findChannel("#seance")!;
			chan.historyRequested = false;
			line(h, "r1", "carol", "first reply", "+draft/reply=zz");
			line(h, "r2", "erin", "second reply", "+draft/reply=zz");
			h.sent();

			requestQuote(h.client, chan, "zz");
			const sent = h.sent();
			expect(sent).to.have.length(1);
			expect(sent[0]).to.match(/^@label=\S+ CHATHISTORY AROUND #seance msgid=zz 1$/);
			expect(chan.historyRequested, "a quote fetch is not a fill").to.equal(false);
			expect(pendingQuotes(h.client)).to.deep.equal(["zz"]);

			batch(
				h,
				[
					"@msgid=zz;time=2026-08-25T11:00:00.000Z :dave!dave@host PRIVMSG #seance :what dave said",
				],
				{
					label: labelOf(sent),
				}
			);

			expect(quotes(h)).to.deep.equal([
				{chan: id, msgid: "zz", quote: {nick: "dave", text: "what dave said"}},
			]);
			// The parent is not put into the timeline.
			expect(h.payloads<{msg: SharedMsg}>("msg").some((p) => p.msg.msgid === "zz")).to.equal(
				false
			);
			expect(h.payloads("more")).to.deep.equal([]);
			expect(chan.quoteOf("zz")).to.deep.equal({nick: "dave", text: "what dave said"});
		});

		it("a cached parent is answered at once, without a request", function () {
			const h = setup();
			const id = joined(h);
			const chan = h.client.findChannel("#seance")!;
			line(h, "p1", "bob", "the parent text");
			h.sent();

			requestQuote(h.client, chan, "p1");

			expect(h.sent()).to.deep.equal([]);
			expect(quotes(h)).to.deep.equal([
				{chan: id, msgid: "p1", quote: {nick: "bob", text: "the parent text"}},
			]);
		});

		it("an /me parent quotes the action text", function () {
			const h = setup();
			joined(h);
			const chan = h.client.findChannel("#seance")!;
			h.sent();
			requestQuote(h.client, chan, "zz");
			batch(
				h,
				[
					"@msgid=zz;time=2026-08-25T11:00:00.000Z :dave!dave@host PRIVMSG #seance :\x01ACTION waves\x01",
				],
				{label: labelOf(h.sent())}
			);

			expect(quotes(h)[0].quote).to.deep.equal({nick: "dave", text: "waves"});
		});

		it("an empty page means the server has nothing for us: not available, and cached", function () {
			const h = setup();
			const id = joined(h);
			const chan = h.client.findChannel("#seance")!;
			h.sent();
			requestQuote(h.client, chan, "zz");
			batch(h, [], {label: labelOf(h.sent())});

			expect(quotes(h)).to.deep.equal([{chan: id, msgid: "zz", quote: {unavailable: true}}]);

			// Asked again: no second request.
			requestQuote(h.client, chan, "zz");
			expect(h.sent()).to.deep.equal([]);
			expect(quotes(h)).to.have.length(2);
		});

		it("a FAIL means the same", function () {
			const h = setup();
			const id = joined(h);
			const chan = h.client.findChannel("#seance")!;
			h.sent();
			requestQuote(h.client, chan, "zz");
			const label = labelOf(h.sent());
			h.transport.line(
				`@label=${label} :irc.test FAIL CHATHISTORY MESSAGE_ERROR AROUND #seance zz :Unknown message id`
			);

			expect(quotes(h)).to.deep.equal([{chan: id, msgid: "zz", quote: {unavailable: true}}]);
		});

		it("a timeout is not cached: the next render may try again", function () {
			const h = setup();
			joined(h);
			const chan = h.client.findChannel("#seance")!;
			h.sent();
			requestQuote(h.client, chan, "zz");
			h.sent();
			clock.tick(HISTORY_TIMEOUT_MS + 1);

			expect(quotes(h)).to.deep.equal([]);
			expect(chan.quoteOf("zz")).to.equal(undefined);
			expect(pendingQuotes(h.client)).to.deep.equal([]);

			clock.tick(QUOTE_FETCH_GAP_MS + 1);
			requestQuote(h.client, chan, "zz");
			expect(h.sent()).to.have.length(1);
		});

		it("one request at a time, the next after the gap; a parent asked twice goes once", function () {
			const h = setup();
			joined(h);
			const chan = h.client.findChannel("#seance")!;
			h.sent();
			requestQuote(h.client, chan, "a");
			requestQuote(h.client, chan, "b");
			requestQuote(h.client, chan, "a");
			const first = h.sent();
			expect(first).to.have.length(1);
			expect(first[0]).to.include("msgid=a 1");
			expect(pendingQuotes(h.client)).to.deep.equal(["a", "b"]);

			batch(
				h,
				["@msgid=a;time=2026-08-25T11:00:00.000Z :dave!dave@host PRIVMSG #seance :A"],
				{
					label: labelOf(first),
				}
			);
			expect(h.sent(), "b waits for the gap").to.deep.equal([]);

			clock.tick(QUOTE_FETCH_GAP_MS);
			const second = h.sent();
			expect(second).to.have.length(1);
			expect(second[0]).to.include("msgid=b 1");
			expect(pendingQuotes(h.client)).to.deep.equal(["b"]);
		});

		it("the queue dies with the connection", function () {
			const h = setup();
			joined(h);
			const chan = h.client.findChannel("#seance")!;
			h.sent();
			requestQuote(h.client, chan, "a");
			requestQuote(h.client, chan, "b");
			h.transport.closed();

			expect(pendingQuotes(h.client)).to.deep.equal([]);
			expect(quotes(h)).to.deep.equal([]);
		});
	});
});
