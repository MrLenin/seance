import {expect} from "chai";
import {buildIdentityOf, isPastRelease, sourceLinks} from "../../client/js/helpers/sourceLinks";

describe("sourceLinks", function () {
	const release = {version: "5.0.2", release: "5.0.2", gitCommit: "e5ed5af2"};
	const past = {version: "5.0.2-1beda24a", release: "5.0.2", gitCommit: "1beda24a"};

	it("points at upstream by default", function () {
		const links = sourceLinks(undefined, release);

		expect(links.repository).to.equal("https://github.com/evilnet/seance");
		expect(links.releaseNotes).to.equal(
			"https://github.com/evilnet/seance/releases/tag/v5.0.2"
		);
		expect(links.releases).to.equal("https://github.com/evilnet/seance/releases");
		expect(links.newIssue).to.equal("https://github.com/evilnet/seance/issues/new");
	});

	it("follows branding.links.source, trailing slash or not", function () {
		const links = sourceLinks("https://github.com/example/chat/", release);

		expect(links.repository).to.equal("https://github.com/example/chat");
		expect(links.newIssue).to.equal("https://github.com/example/chat/issues/new");
	});

	it("a release build links its commit but has nothing to compare", function () {
		expect(isPastRelease(release)).to.be.false;

		const links = sourceLinks(undefined, release);

		expect(links.commit).to.equal("https://github.com/evilnet/seance/commit/e5ed5af2");
		expect(links.sinceRelease).to.be.null;
		expect(links.behindDevelop).to.be.null;
	});

	it("a build past its release compares both ways", function () {
		expect(isPastRelease(past)).to.be.true;

		const links = sourceLinks(undefined, past);

		expect(links.sinceRelease).to.equal(
			"https://github.com/evilnet/seance/compare/v5.0.2...1beda24a"
		);
		expect(links.behindDevelop).to.equal(
			"https://github.com/evilnet/seance/compare/1beda24a...develop"
		);
	});

	it("a build without git is neither past nor comparable", function () {
		const unknown = {version: "5.0.2", release: "5.0.2", gitCommit: null};

		expect(isPastRelease(unknown)).to.be.false;
		expect(sourceLinks(undefined, unknown).commit).to.be.null;
	});

	it("reads the identity out of the configuration, blanks for what is missing", function () {
		expect(buildIdentityOf(null)).to.deep.equal({version: "", release: "", gitCommit: null});
		expect(buildIdentityOf({version: "1", release: "1", gitCommit: ""})).to.deep.equal({
			version: "1",
			release: "1",
			gitCommit: null,
		});
	});
});
