// Links into the repository a build comes from, for the Help and Changelog
// windows. `branding.links.source` names the repository (GitHub URL shapes;
// the default is upstream, a fork points it at itself) and the build's
// identity comes from `configuration.ts` — `version`, `release`, `gitCommit`,
// filled in by webpack's `resolveBuild`. Vue-free: test/helpers/sourceLinks.ts.

import {UPSTREAM_REPOSITORY} from "../branding";

export interface BuildIdentity {
	/** `5.0.2` for a release, `5.0.2-e5ed5af2` for a build past one. */
	version: string;
	/** The release the build is, or follows. */
	release: string;
	/** Short sha the build was made from; null when unknown. */
	gitCommit: string | null;
}

export interface SourceLinks {
	repository: string;
	/** The release's notes. */
	releaseNotes: string;
	/** All releases. */
	releases: string;
	/** The new-issue form. */
	newIssue: string;
	/** The commit the build was made from; null when unknown. */
	commit: string | null;
	/** The release compared with the build's commit; null for a release build. */
	sinceRelease: string | null;
	/** The build's commit compared with develop; null for a release build. */
	behindDevelop: string | null;
}

/** The build's identity out of the configuration object, absent parts blank. */
export function buildIdentityOf(config: Partial<BuildIdentity> | null | undefined): BuildIdentity {
	return {
		version: config?.version ?? "",
		release: config?.release ?? "",
		gitCommit: config?.gitCommit || null,
	};
}

/** True for a build made from a commit past its release, rather than the release itself. */
export function isPastRelease(build: BuildIdentity): boolean {
	return build.gitCommit !== null && build.version !== build.release;
}

export function sourceLinks(source: string | undefined, build: BuildIdentity): SourceLinks {
	const repository = (source || UPSTREAM_REPOSITORY).replace(/\/+$/, "");
	const commit = build.gitCommit;
	const past = isPastRelease(build);

	return {
		repository,
		releaseNotes: `${repository}/releases/tag/v${build.release}`,
		releases: `${repository}/releases`,
		newIssue: `${repository}/issues/new`,
		commit: commit ? `${repository}/commit/${commit}` : null,
		sinceRelease: past ? `${repository}/compare/v${build.release}...${commit}` : null,
		behindDevelop: past ? `${repository}/compare/${commit}...develop` : null,
	};
}
