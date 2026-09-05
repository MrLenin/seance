<template>
	<div
		id="connect"
		:class="['window', {'link-approval': fromLink}]"
		:role="fromLink ? 'dialog' : 'tabpanel'"
		:aria-modal="fromLink ? 'true' : undefined"
		aria-label="Connect"
	>
		<div v-if="!fromLink" class="header">
			<SidebarToggle />
		</div>
		<form class="container" method="post" action="" @submit.prevent="onSubmit">
			<h1 class="title">{{ fromLink ? "Connect to a new server?" : t("connect.title") }}</h1>

			<div v-if="linkNotice" class="connect-notice connect-link-notice">
				{{ linkNotice }}
			</div>

			<h2 v-if="!hostLocked">Server</h2>
			<div v-if="hostLocked" class="connect-row connect-network">
				<label>Network</label>
				<div class="input-wrap">
					<strong>{{ networkLabel }}</strong>
				</div>
			</div>
			<div v-if="!hostLocked" class="connect-row">
				<label for="connect:host">Server</label>
				<div class="input-wrap">
					<input
						id="connect:host"
						v-model.trim="form.host"
						class="input"
						name="host"
						aria-label="Server address"
						placeholder="irc.example.org"
						maxlength="255"
						required
					/>
					<span id="connect:portseparator">:</span>
					<input
						id="connect:port"
						v-model.number="form.port"
						class="input"
						type="number"
						min="1"
						max="65535"
						name="port"
						aria-label="Server port"
						required
					/>
				</div>
			</div>
			<div v-if="!hostLocked" class="connect-row">
				<label></label>
				<div class="input-wrap">
					<label class="tls">
						<input v-model="form.tls" type="checkbox" name="tls" />
						Use secure connection (TLS)
					</label>
				</div>
			</div>

			<h2>User</h2>
			<div class="connect-row">
				<label for="connect:nick">Nick</label>
				<input
					id="connect:nick"
					v-model.trim="form.nick"
					class="input nick"
					name="nick"
					pattern="[^\s:!@]+"
					maxlength="100"
					required
				/>
			</div>
			<div class="connect-row">
				<label for="connect:channels">Channels</label>
				<input
					id="connect:channels"
					v-model.trim="form.join"
					class="input"
					name="join"
					placeholder="#channel, #another (optional)"
				/>
			</div>

			<h2 id="label-auth">Authentication</h2>
			<div class="connect-row">
				<label></label>
				<div class="input-wrap">
					<label class="tls">
						<input v-model="showSasl" type="checkbox" name="sasl" />
						I have a services account (SASL)
					</label>
				</div>
			</div>
			<template v-if="showSasl">
				<div class="connect-row">
					<label for="connect:saslAccount">Account</label>
					<input
						id="connect:saslAccount"
						v-model.trim="form.saslAccount"
						class="input"
						name="saslAccount"
						maxlength="100"
						autocomplete="username"
						required
					/>
				</div>
				<div class="connect-row">
					<label for="connect:saslPassword">Password</label>
					<RevealPassword
						v-slot:default="slotProps"
						class="input-wrap password-container"
					>
						<input
							id="connect:saslPassword"
							ref="passwordInput"
							v-model="form.saslPassword"
							class="input"
							:type="slotProps.isVisible ? 'text' : 'password'"
							name="saslPassword"
							maxlength="300"
							autocomplete="current-password"
							required
						/>
					</RevealPassword>
				</div>
				<div class="connect-row">
					<label></label>
					<div class="input-wrap">
						<label class="tls">
							<input v-model="pushEnabled" type="checkbox" name="pushEnabled" />
							Push notifications (registers when the server supports them)
						</label>
					</div>
				</div>
				<div v-if="showSavedNetworks" class="connect-row">
					<label></label>
					<div class="input-wrap">
						<label class="tls">
							<input
								v-model="rememberPassword"
								type="checkbox"
								name="rememberPassword"
							/>
							Remember password on this device
						</label>
					</div>
				</div>
			</template>

			<div class="connect-row">
				<label></label>
				<div class="input-wrap">
					<label class="tls">
						<input
							v-model="notifyEnabled"
							type="checkbox"
							name="notifyEnabled"
							@change="onNotifyToggle"
						/>
						Browser notifications for this network
					</label>
				</div>
			</div>

			<div v-if="showSavedNetworks" class="connect-row">
				<label></label>
				<div class="input-wrap">
					<label class="tls">
						<input v-model="autoconnect" type="checkbox" name="autoconnect" />
						Connect automatically when the app starts
					</label>
				</div>
			</div>

			<div v-if="notice" class="connect-notice">{{ notice }}</div>
			<div v-if="submitted" class="connect-notice">
				Connecting as <strong>{{ submitted.nick }}</strong> to
				<strong>{{ submitted.host }}:{{ submitted.port }}</strong
				>…
			</div>

			<div :class="{'link-approval-buttons': fromLink}">
				<button v-if="fromLink" type="button" class="btn btn-cancel" @click="cancelLink">
					Not now
				</button>
				<button type="submit" class="btn">{{ t("connect.submit") }}</button>
			</div>
		</form>
	</div>
</template>

<style>
#connect .connect-notice,
#connect .saved-networks-empty {
	padding: 10px;
	margin-bottom: 10px;
	border-radius: 2px;
	background-color: #d9edf7;
	color: #31708f;
}

#connect .connect-network .input-wrap {
	padding: 6px 0;
}

#connect .connect-link-notice {
	background-color: #fcf8e3;
	color: #8a6d3b;
}

#connect.link-approval {
	position: fixed;
	inset: 0;
	z-index: 999;
	background: rgb(0 0 0 / 90%);
	padding: 20px;
}

#connect.link-approval .container {
	width: min(560px, 100%);
	margin: auto;
	padding: 24px;
	border-radius: 5px;
	background: var(--window-bg-color);
}

#connect .link-approval-buttons {
	display: flex;
	gap: 10px;
}

#connect .link-approval-buttons .btn {
	flex: 1;
}

#connect .link-approval-buttons .btn-cancel {
	background: transparent;
	color: var(--body-color);
}
</style>

<script lang="ts">
import {defineComponent, onMounted, reactive, ref, watch} from "vue";

import {useStore} from "../../js/store";
import {brandingFeatures, brandingString, expandNick} from "../../js/branding";
import {autoconnectSavedNetworks, createNetwork} from "../../js/irc/manager";
import * as saved from "../../js/irc/saved-networks";
import {defaultPort, SavedNetwork} from "../../js/irc/saved-networks";
import {mergeJoinLists} from "../../js/helpers/linkTarget";
import {router, switchToChannel} from "../../js/router";
import type {ConnectOptions} from "../../js/irc/types";
import RevealPassword from "../RevealPassword.vue";
import SidebarToggle from "../SidebarToggle.vue";

export type {ConnectOptions};

/**
 * URL parameters that pre-fill the form (and so beat the last-used entry).
 * `saslPassword` is deliberately not accepted: a link must not carry secrets
 * (docs/projects/irc-link-new-server-dialog.md).
 */
const CONNECT_PARAMS = ["host", "port", "tls", "nick", "join", "channels", "saslAccount"];

export default defineComponent({
	name: "Connect",
	components: {
		RevealPassword,
		SidebarToggle,
	},
	props: {
		queryParams: Object,
	},
	setup(props) {
		const store = useStore();
		// Branding is loaded before the app renders, so a snapshot is enough.
		const branding = store.state.branding;
		const features = brandingFeatures(branding);
		const network = branding.defaultNetwork;
		const defaults = store.state.serverConfiguration?.defaults;
		const t = (key: string) => brandingString(key, branding);

		const tls = network?.tls ?? defaults?.tls ?? true;
		// The server the deploy points at. Pinned when the host is locked.
		const server = {
			host: network?.host || defaults?.host || "",
			port:
				network?.port ??
				// 6697 is TheLounge's plain-IRC default; not meaningful over WebSocket.
				(defaults?.port && defaults.port !== 6697 ? defaults.port : defaultPort(tls)),
			tls,
		};
		const form = reactive<ConnectOptions>({
			...server,
			nick: network?.nick ? expandNick(network.nick) : defaults?.nick || "",
			join: network?.channels?.join(", ") || defaults?.join || "",
			sasl: defaults?.sasl === "plain" ? "plain" : "",
			saslAccount: defaults?.saslAccount || "",
			saslPassword: defaults?.saslPassword || "",
		});

		// `lockHost` hides the server fields; `allowCustomServer: false` does the
		// same and additionally ignores any other host from saved networks or
		// URL parameters.
		const hostLocked = !!network && (network.lockHost === true || !features.allowCustomServer);
		const networkLabel = network?.name || server.host;
		const showSavedNetworks = features.saveNetworks;

		const pinServer = () => {
			if (hostLocked) {
				Object.assign(form, server);
			}
		};

		const showSasl = ref(false);
		const rememberPassword = ref(false);
		const autoconnect = ref(false);
		/** Push defaults to on for a new network: the flag means "register when
		 * the server supports it", which is what nearly everyone wants. */
		const pushEnabled = ref(true);

		/** Browser notifications default to on for a new network (no
		 * authentication involved, unlike push). */
		const notifyEnabled = ref(true);

		/** The toggle itself is the user gesture for the Notification
		 * permission ask (only while the decision is still open). */
		const onNotifyToggle = () => {
			if (
				notifyEnabled.value &&
				typeof Notification !== "undefined" &&
				Notification.permission === "default"
			) {
				void Notification.requestPermission().catch(() => undefined);
			}
		};

		/** The saved entry the form was filled from; its uuid is reused on connect. */
		const selectedUuid = ref<string | null>(null);
		const submitted = ref<ConnectOptions | null>(null);
		const notice = ref("");
		const passwordInput = ref<HTMLInputElement | null>(null);

		const prefill = (net: SavedNetwork) => {
			form.host = net.host;
			form.port = net.port;
			form.tls = net.tls;
			form.nick = net.nick;
			form.join = net.join;
			form.sasl = net.sasl;
			form.saslAccount = net.saslAccount;
			form.saslPassword = net.saslPassword;
			showSasl.value = net.sasl === "plain";
			rememberPassword.value = !!net.rememberPassword;
			autoconnect.value = !!net.autoconnect;
			pushEnabled.value = net.pushEnabled !== false;
			notifyEnabled.value = net.notifyEnabled !== false;
			selectedUuid.value = net.uuid;
			notice.value = "";
			pinServer();
		};

		const hasConnectParams = CONNECT_PARAMS.some(
			(key) => props.queryParams && props.queryParams[key] !== undefined
		);

		// boot.ts routes here when a web+irc:// link (or a ?host= URL) names a
		// server that is not approved yet (`fromLink`), was refused by a locked
		// deploy (`linkIgnored`), or matches a saved network that still needs
		// its password typed (`savedLink`). See docs/resources/irc-links.md.
		const savedLinkUuid = firstParam(props.queryParams?.savedLink);
		const savedLink = savedLinkUuid ? saved.get(savedLinkUuid) : undefined;
		const linkIgnored = firstParam(props.queryParams?.linkIgnored);
		const fromLink = isTruthyParam(props.queryParams?.fromLink);
		let focusPassword = false;

		if (savedLink) {
			prefill(savedLink);
			const linkJoin = firstParam(props.queryParams?.join);

			if (linkJoin) {
				form.join = mergeJoinLists(form.join, linkJoin);
			}

			if (savedLink.sasl === "plain" && !savedLink.saslPassword) {
				notice.value = `Enter the password for ${savedLink.saslAccount} to connect.`;
				focusPassword = true;
			}
		} else if (hasConnectParams) {
			applyQueryParams(form, props.queryParams);
			pinServer();
			showSasl.value = form.sasl === "plain" || !!form.saslAccount;
		} else {
			// Pre-fill from the last-used entry only while nothing is live yet;
			// with networks up, this screen is "add another network" and starts
			// blank. Existing entries are managed in Settings → Networks.
			const last =
				showSavedNetworks && store.state.networks.length === 0
					? saved.lastUsed()
					: undefined;

			if (last) {
				prefill(last);
			} else {
				showSasl.value = form.sasl === "plain" || !!form.saslAccount;
			}
		}

		// What the link asked for, said out loud — the approval step's context.
		const linkNotice = linkIgnored
			? `This app only connects to ${networkLabel}. The link to ${linkIgnored} was ignored.`
			: fromLink && !savedLink && form.host
			? `This link suggests connecting to ${form.host}:${form.port}` +
			  (form.join ? ` and joining ${form.join}` : "") +
			  ". Nothing is saved until you choose to connect."
			: "";

		// Follow the TLS checkbox while the port is still one of the defaults.
		watch(
			() => form.tls,
			(useTls) => {
				if (form.port === defaultPort(!useTls)) {
					form.port = defaultPort(useTls);
				}
			}
		);

		const onSubmit = () => {
			form.sasl = showSasl.value ? "plain" : "";

			if (!showSasl.value) {
				form.saslAccount = "";
				form.saslPassword = "";
			}

			submitted.value = {...form};
			notice.value = "";
			const client = createNetwork({
				...submitted.value,
				uuid: selectedUuid.value ?? undefined,
				rememberPassword: showSasl.value && rememberPassword.value,
				autoconnect: autoconnect.value,
				pushEnabled: pushEnabled.value,
				notifyEnabled: notifyEnabled.value,
			});
			selectedUuid.value = client.uuid;
			autoconnectSavedNetworks();
		};

		const cancelLink = async () => {
			autoconnectSavedNetworks();

			// createNetwork dispatches its lobby synchronously and normally moves
			// us away from this dialog. If there was nothing to start, return to
			// an existing network or the ordinary blank connect screen.
			if (router.currentRoute.value.name !== "Connect") {
				return;
			}

			const firstChannel = store.state.networks[0]?.channels[0];

			if (firstChannel) {
				switchToChannel(firstChannel);
			} else {
				await router.replace({name: "Connect"});
			}
		};

		onMounted(() => {
			// A link to a saved network whose password was not remembered:
			// everything is filled in but the password, so put the cursor there.
			if (focusPassword) {
				passwordInput.value?.focus();
			}
		});

		return {
			form,
			t,
			hostLocked,
			networkLabel,
			showSavedNetworks,
			showSasl,
			rememberPassword,
			autoconnect,
			pushEnabled,
			notifyEnabled,
			onNotifyToggle,
			selectedUuid,
			submitted,
			notice,
			linkNotice,
			fromLink,
			passwordInput,
			onSubmit,
			cancelLink,
		};
	},
});

function isTruthyParam(value: unknown): boolean {
	if (Array.isArray(value)) {
		value = value[0];
	}

	return value === "" || value === "1" || value === "true" || value === true;
}

/**
 * Pre-fill the form from `?host=...&nick=...` style URL parameters or the
 * output of `parseIrcUri` for `web+irc://` links. `channels` is accepted as an
 * alias for `join` for compatibility with other clients.
 */
function applyQueryParams(form: ConnectOptions, params?: Record<string, any>) {
	if (!params) {
		return;
	}

	const host = firstParam(params.host);
	const port = firstParam(params.port);
	const tls = firstParam(params.tls);
	const nick = firstParam(params.nick);
	const join = firstParam(params.join ?? params.channels);
	const saslAccount = firstParam(params.saslAccount);

	if (host) {
		form.host = host;
	}

	if (port && !Number.isNaN(Number(port))) {
		form.port = Number(port);
	}

	if (tls !== undefined) {
		form.tls = !(tls === "0" || tls === "false");
	}

	if (nick) {
		form.nick = nick;
	}

	if (join) {
		form.join = join
			.split(",")
			.map((chan) => chan.trim())
			.filter((chan) => chan.length > 0)
			.map((chan) => (chan.match(/^[#&!+]/) ? chan : `#${chan}`))
			.join(", ");
	}

	if (saslAccount) {
		form.saslAccount = saslAccount;
		form.sasl = "plain";
	}
}

/** First value of a possibly-repeated query parameter, as a string. */
function firstParam(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		value = value[0];
	}

	return value === undefined || value === null ? undefined : String(value);
}
</script>
