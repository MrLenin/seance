// What clock the reader's locale writes times in, asked once to seed the
// `use12hClock` setting's default on first run (client/js/settings.ts). An
// en-US browser gets "3:04 PM" without touching Settings, a de-DE one gets
// "15:04"; a stored setting always wins, so this only ever decides the very
// first render on a browser. Vue-free and DOM-free: test/helpers/hourCycle.ts.

/**
 * True when `locales` (the runtime's own locale by default, which is what the
 * browser resolves `navigator.language`/the OS regional format to) writes the
 * time of day on a 12-hour clock.
 *
 * Three ways of asking, oldest browsers last: `hourCycle` (h11/h12 are the
 * 12-hour ones, h23/h24 the 24-hour ones), then the older `hour12`, then
 * formatting 13:00 and looking for a day period — "1 PM" has one, "13" does
 * not, and asking for the part rather than the digits keeps it right in
 * locales that number in something other than ASCII digits.
 */
export function prefersTwelveHourClock(locales?: string | string[]): boolean {
	try {
		const format = new Intl.DateTimeFormat(locales, {hour: "numeric"});
		const resolved = format.resolvedOptions();

		if (resolved.hourCycle) {
			return resolved.hourCycle === "h11" || resolved.hourCycle === "h12";
		}

		if (typeof resolved.hour12 === "boolean") {
			return resolved.hour12;
		}

		return format
			.formatToParts(new Date(2020, 0, 1, 13, 0, 0))
			.some((part) => part.type === "dayPeriod");
	} catch {
		// A runtime without a usable Intl: the client's historical default.
		return false;
	}
}
