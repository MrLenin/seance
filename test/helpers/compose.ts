import {expect} from "chai";
import {MessageType} from "../../shared/types/msg";
import {
	findEditableAfter,
	findEditableBefore,
	findLastEditable,
} from "../../client/js/helpers/compose";
import type {ClientChan, ClientMessage} from "../../client/js/types";

let nextId = 1;

function msg(overrides: Partial<ClientMessage> = {}): ClientMessage {
	const id = nextId++;

	return {
		id,
		type: MessageType.MESSAGE,
		self: true,
		msgid: `msgid-${id}`,
		text: `text ${id}`,
		...overrides,
	} as ClientMessage;
}

function chan(messages: ClientMessage[]): ClientChan {
	return {messages} as ClientChan;
}

describe("edit stepping (helpers/compose.ts)", function () {
	describe("findLastEditable", function () {
		it("picks the newest own editable message", function () {
			const [a, b] = [msg(), msg()];
			const channel = chan([a, b, msg({self: false})]);

			expect(findLastEditable(channel)).to.equal(b);
		});

		it("skips redacted, superseded, msgid-less and non-plain messages", function () {
			const editable = msg();
			const channel = chan([
				editable,
				msg({redacted: {by: "op", time: new Date()}}),
				msg({supersededBy: 99}),
				msg({msgid: undefined}),
				msg({type: MessageType.ACTION}),
			]);

			expect(findLastEditable(channel)).to.equal(editable);
		});

		it("is undefined when the channel has no own editable message", function () {
			expect(findLastEditable(chan([msg({self: false})]))).to.equal(undefined);
			expect(findLastEditable(chan([]))).to.equal(undefined);
		});
	});

	describe("findEditableBefore", function () {
		it("returns the nearest older own editable message", function () {
			const [a, b] = [msg(), msg()];
			const channel = chan([
				a,
				msg({self: false}),
				msg({redacted: {by: "op", time: new Date()}}),
				b,
			]);

			expect(findEditableBefore(channel, b)).to.equal(a);
		});

		it("is undefined at the oldest own message", function () {
			const a = msg();
			const channel = chan([msg({self: false}), a]);

			expect(findEditableBefore(channel, a)).to.equal(undefined);
		});

		it("is undefined for a message the channel does not hold", function () {
			expect(findEditableBefore(chan([msg()]), msg())).to.equal(undefined);
		});
	});

	describe("findEditableAfter", function () {
		it("returns the nearest newer own editable message", function () {
			const [a, b] = [msg(), msg()];
			const channel = chan([a, msg({supersededBy: 99}), msg({self: false}), b]);

			expect(findEditableAfter(channel, a)).to.equal(b);
		});

		it("is undefined at the newest own message", function () {
			const a = msg();
			const channel = chan([a, msg({self: false})]);

			expect(findEditableAfter(channel, a)).to.equal(undefined);
		});

		it("is undefined for a message the channel does not hold", function () {
			expect(findEditableAfter(chan([msg()]), msg())).to.equal(undefined);
		});
	});

	it("matches the edited message by id, not object identity", function () {
		const [a, b, c] = [msg(), msg(), msg()];
		const channel = chan([a, b, c]);
		const copyOfB = {...b};

		expect(findEditableBefore(channel, copyOfB)).to.equal(a);
		expect(findEditableAfter(channel, copyOfB)).to.equal(c);
	});
});
