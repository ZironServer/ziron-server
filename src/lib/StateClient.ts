/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {Socket} from "ziron-client";
import EventEmitter from "emitix";
import { address } from "ip";
import {arrayContentEquals, deepEqual, Writable} from "./Utils";
import {CLUSTER_VERSION} from "./ClusterVersion";

type LocalEventEmitter = EventEmitter<{
    'leadershipChange': [boolean],
    'brokersChange': [string[]],
    'sessionIdChange': [string],
    'sessionPayloadChange': [Record<any,any>]
    'error': [Error]
}>;

type BrokerUpdate = {
    time: number,
    uris: string[]
}

type JoinResponse = {
    session: {
        id: string,
        shared: object,
    },
    brokers: BrokerUpdate,
    leader: boolean
}

export default class StateClient {

    private readonly _localEmitter: LocalEventEmitter = new EventEmitter();
    public readonly once: LocalEventEmitter['once'] = this._localEmitter.once.bind(this._localEmitter);
    public readonly on: LocalEventEmitter['on'] = this._localEmitter.on.bind(this._localEmitter);
    public readonly off: LocalEventEmitter['off'] = this._localEmitter.off.bind(this._localEmitter);
    private readonly _emit: LocalEventEmitter['emit'] = this._localEmitter.emit.bind(this._localEmitter);

    private readonly _stateSocket: Socket;

    public readonly sessionPayload: Record<any,any> = {};
    public readonly clusterSessionId: string = '/';
    public readonly leader: boolean = false;
    public get brokers() {
        return this._currentBrokerUpdate.uris;
    }

    private _currentBrokerUpdate: BrokerUpdate = {time: -1, uris: []};

    private _joinData: {shared: object, payload: object};

    constructor(options: {
        joinTokenUri: string,
        joinTokenSecret: string,
        sharedData: Record<any, any>,
        joinPayload: Record<any, any>,
        id: string,
        path: string,
        port: number
    }) {
        this._joinData = {
            shared: options.sharedData,
            payload: options.joinPayload
        };

        const stateSocket = new Socket(options.joinTokenUri, {
            ackTimeout: 3000,
            connectTimeout: 3000,
            autoReconnect: {
                active: true,
                initialDelay: 1000,
                randomness: 1000,
                multiplier: 1,
                maxDelay: 2000,
            },
            handshakeAttachment: {
                secret: options.joinTokenSecret,
                clusterVersion: CLUSTER_VERSION,
                node: {
                    id: options.id,
                    type: 0,
                    ip: address(),
                    port: options.port,
                    path: options.path,
                },
            },
        });
        stateSocket.on("error", (err) => {
            this._emit("error",new Error("Error in state socket: " + err.stack));
        });
        stateSocket.procedures.addLeadership = (_,end) => {
            this._updateLeadership(true);
            end();
        };
        stateSocket.receivers.updateBrokers = (brokersUpdate: BrokerUpdate) => {
            this._handleBrokerUpdate(brokersUpdate);
        }
        stateSocket.on("disconnect", () => {
            this._updateLeadership(false);
        })

        let invokeJoinRetryTicker;
        const invokeJoin = async () => {
            try {
                const joinResponse: JoinResponse = await stateSocket.invoke("join",this._joinData);
                this._handleBrokerUpdate(joinResponse.brokers);
                this._updateClusterSessionId(joinResponse.session.id);
                this._updateClusterSessionPayload(joinResponse.session.shared);
            } catch (e) {
                if(!stateSocket.isConnected()) return;
                invokeJoinRetryTicker = setTimeout(invokeJoin, 2000);
            }
        };
        stateSocket.on("connect", () => {
            clearTimeout(invokeJoinRetryTicker);
            invokeJoin();
        });
        this._stateSocket = stateSocket;
    }

    public async connect() {
        await this._stateSocket.connect();
    }

    private _handleBrokerUpdate(brokersUpdate: BrokerUpdate) {
        if(this._currentBrokerUpdate.time <= brokersUpdate.time) {
            const tempCurrentBrokerUpdate = this._currentBrokerUpdate;
            this._currentBrokerUpdate = brokersUpdate;
            if(!arrayContentEquals(tempCurrentBrokerUpdate.uris,this._currentBrokerUpdate.uris))
                this._emit("brokersChange",this._currentBrokerUpdate.uris);
        }
    }

    private _updateLeadership(state: boolean) {
        const temp = this.leader;
        (this as Writable<StateClient>).leader = state;
        if(temp !== this.leader) this._emit("leadershipChange",this.leader);
    }

    private _updateClusterSessionId(id: string) {
        const temp = this.clusterSessionId;
        (this as Writable<StateClient>).clusterSessionId = id;
        if(temp !== this.clusterSessionId) this._emit("sessionIdChange",this.clusterSessionId);
    }

    private _updateClusterSessionPayload(payload: Record<any,any>) {
        const temp = this.sessionPayload;
        (this as Writable<StateClient>).sessionPayload = payload;
        if(!deepEqual(temp,this.sessionPayload))
            this._emit("sessionPayloadChange",this.sessionPayload);
    }

    public disconnect(): void {
        this._stateSocket.disconnect();
    }

}