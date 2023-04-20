import Socket from "./Socket";
import {WebSocket} from "ziron-ws";
import UpgradeRequest from "./http/UpgradeRequest";

export type CustomWebSocket = WebSocket<{}> & {
    req: UpgradeRequest,
    zSocket: Socket
}