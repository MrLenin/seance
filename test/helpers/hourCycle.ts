import {expect} from "chai";

import {prefersTwelveHourClock} from "../../client/js/helpers/hourCycle";

// Seeds the `use12hClock` default (client/js/settings.ts) from the browser's
// locale, so a reader whose norm is "3:04 PM" never has to find the setting.
describe("prefersTwelveHourClock", () => {
	it("reads the clock a locale writes times in", () => {
		expect(prefersTwelveHourClock("en-US")).to.be.true;
		expect(prefersTwelveHourClock("en-AU")).to.be.true;

		expect(prefersTwelveHourClock("de-DE")).to.be.false;
		expect(prefersTwelveHourClock("fr-FR")).to.be.false;
		expect(prefersTwelveHourClock("en-GB")).to.be.false;
	});

	it("honours a locale's own hour-cycle extension over its region", () => {
		expect(prefersTwelveHourClock("de-DE-u-hc-h12")).to.be.true;
		expect(prefersTwelveHourClock("en-US-u-hc-h23")).to.be.false;
	});

	it("takes a list, the way navigator.languages comes", () => {
		expect(prefersTwelveHourClock(["en-US", "de-DE"])).to.be.true;
		expect(prefersTwelveHourClock(["de-DE", "en-US"])).to.be.false;
	});

	it("answers for the runtime's own locale when asked nothing", () => {
		expect(prefersTwelveHourClock()).to.be.a("boolean");
	});

	it("falls back to a 24-hour clock when Intl cannot answer", () => {
		expect(prefersTwelveHourClock("not a language tag")).to.be.false;
	});
});
