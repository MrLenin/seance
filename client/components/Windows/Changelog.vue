<template>
	<div id="changelog" class="window" aria-label="Changelog">
		<div class="header">
			<SidebarToggle />
		</div>
		<div class="container">
			<router-link id="back-to-help" to="/help">« Help</router-link>

			<h1 class="title">Release notes for v{{ build.release }}</h1>

			<p v-if="pastRelease">
				This build is
				<a :href="source.commit" target="_blank" rel="noopener"
					>commit <code>{{ build.gitCommit }}</code></a
				>, after v{{ build.release }}:
				<a :href="source.sinceRelease" target="_blank" rel="noopener"
					>what changed since the release</a
				>.
			</p>
			<p>
				Release notes are not bundled with the build.
				<a :href="source.releaseNotes" target="_blank" rel="noopener"
					>Read the notes for v{{ build.release }}</a
				>
				or
				<a :href="source.releases" target="_blank" rel="noopener">see all releases</a>.
			</p>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";
import {useStore} from "../../js/store";
import {buildIdentityOf, isPastRelease, sourceLinks} from "../../js/helpers/sourceLinks";
import SidebarToggle from "../SidebarToggle.vue";

export default defineComponent({
	name: "Changelog",
	components: {
		SidebarToggle,
	},
	setup() {
		const store = useStore();
		const build = computed(() => buildIdentityOf(store.state.serverConfiguration));
		const pastRelease = computed(() => isPastRelease(build.value));
		const source = computed(() => sourceLinks(store.state.branding.links?.source, build.value));

		return {
			build,
			pastRelease,
			source,
		};
	},
});
</script>
