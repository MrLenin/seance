// A TCP proxy in front of the ircd that a scenario can cut and close: what a
// phone's radio going away does to the WebSocket (`cut()`), and the dials
// that follow while it is still away (`refuse()`: every new connection is
// accepted and dropped at once, a fast 1006 in the page). `accept()` lets
// dials through again. The page connects to `port`; `target` is the ircd's
// plain WebSocket port.

import net from "node:net";

export function startProxy({port, host = "127.0.0.1", target}) {
	const pairs = new Set();
	let accepting = true;

	const server = net.createServer((socket) => {
		if (!accepting) {
			socket.destroy();
			return;
		}

		const backend = net.connect(target.port, target.host);
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
	const cut = () => {
		for (const pair of pairs) {
			pair.socket.destroy();
			pair.backend.destroy();
		}

		pairs.clear();
	};

	return {
		listen: () => new Promise((resolve) => server.listen(port, host, resolve)),
		cut,
		refuse: () => {
			accepting = false;
		},
		accept: () => {
			accepting = true;
		},
		close: () => {
			cut();
			server.close();
		},
	};
}
