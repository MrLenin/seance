# Reply quotes for parents the UI does not hold

Field report 2026-09-17 (Rubin): replies to messages the UI never loaded, or
trimmed, render as "(unknown message)" — no context. The quote was found by
scanning the channel's message array for the parent msgid at render time
(`helpers/messageUpdates.ts replyQuote`), so anything outside the buffer was
lost: a parent older than the 50-row fill (the common case on a phone), or one
the 100-message trim of a hidden channel dropped.

## Design

Two halves, one cache, in the IRC layer (bus-contract § 1.4: it owns the
msgid map):

1. **Copy at arrival.** `Channel.noteQuote(msgid, nick, text)` records an
   80-character excerpt of every message handed to the UI (a bounded FIFO,
   `QUOTE_CACHE_MAX`). A reply whose parent is in the cache is delivered with
   `replyQuote: {nick, text}` already on it, so a later trim cannot take the
   quote away. Pending copies of our own replies get it the same way.
2. **Fetch on demand.** A rendered reply with neither `replyQuote` nor a
   loaded parent emits `quote:fetch {target, msgid}`. The IRC layer asks
   `CHATHISTORY AROUND <chan> msgid=<parent> 1` (verified on nefarious2: limit 1
   returns exactly the parent), one request per distinct parent, one in flight
   at a time with a short gap between them (`QUOTE_FETCH_GAP_MS`) so a burst of
   replies never trips the server's flood penalty. The answer is cached and
   dispatched as `msg:quote {chan, msgid, quote}`; the UI applies it to every
   reply in that channel naming the parent. An empty page or a FAIL — the
   presence filter, or a message the server never stored — is cached and shown
   as "(message not available)", which is a different statement from
   "(unknown message)" (not asked yet, or a timeout, which may be retried).

The fetched parent is never inserted into the timeline (that would splice an
out-of-order row); tapping a quote whose parent is not in the buffer does
nothing. Loading real context around a parent is a separate feature.

A quote request is a history request of mode `quote`: it does not mark the
channel as filled (`historyRequested`), does not fold with `more`, and is not
re-asked after a reconnect.
