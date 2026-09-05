import type {ClientChan, ClientNetwork} from "../types";
import {ChanType} from "../../../shared/types/chan";

export default (network: ClientNetwork, channel: ClientChan): boolean =>
	network.isCollapsed && channel.type !== ChanType.LOBBY;
