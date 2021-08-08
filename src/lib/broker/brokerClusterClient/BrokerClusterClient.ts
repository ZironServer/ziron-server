/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {ExternalBrokerClient} from "../ExternalBrokerClient";
import StateClient from "../../StateClient";
import {distinctArrayFilter} from "../../Utils";
import ClientPool from "./ClientPool";
import {CLUSTER_VERSION} from "../../ClusterVersion";
import {NoMatchingBrokerClientError} from "ziron-errors";
import EventEmitter from "emitix";
import InternalBroker from "../InternalBroker";
import {DataType} from "ziron-engine";
import RendezvousHashing from "./RendezvousHashing";

type LocalEventEmitter = EventEmitter<{
    'brokersClientPoolsUpdate': [],
    'error': [Error]
}>;

export default class BrokerClusterClient implements ExternalBrokerClient {

    private _brokerUris: string[];
    private _brokerClientMap: Record<string,ClientPool> = {};

    private readonly _stateClient: StateClient;
    private readonly _internalBroker: InternalBroker;
    private readonly _mapper: RendezvousHashing = new RendezvousHashing();

    private readonly _joinTokenSecret: string;
    private readonly _maxClientPoolSize: number;

    private readonly _localEmitter: LocalEventEmitter = new EventEmitter();
    public readonly once: LocalEventEmitter['once'] = this._localEmitter.once.bind(this._localEmitter);
    public readonly on: LocalEventEmitter['on'] = this._localEmitter.on.bind(this._localEmitter);
    public readonly off: LocalEventEmitter['off'] = this._localEmitter.off.bind(this._localEmitter);
    private readonly _emit: LocalEventEmitter['emit'] = this._localEmitter.emit.bind(this._localEmitter);

    constructor(stateClient: StateClient, internalBroker: InternalBroker, options: {
        joinTokenSecret: string,
        maxClientPoolSize: number
    }) {
        this._stateClient = stateClient;
        this._internalBroker = internalBroker;
        this._joinTokenSecret = options.joinTokenSecret;
        this._maxClientPoolSize = options.maxClientPoolSize;

        stateClient.on("brokersChange",brokers => this._setBrokerUris(brokers));
        this._setBrokerUris(stateClient.brokers);
    }

    private _setBrokerUris(uris: string[]): void {
        this._brokerUris = uris.filter(distinctArrayFilter);
        this._mapper.setSites(this._brokerUris);
        this.updateToBrokerUris();
    }

    private _processClientPoolPublishEvent = (channel: string, data: any, type: DataType) => {
        this._internalBroker.processExternalPublish(channel,data,type);
    }

    private _handleClientPoolError = (error: Error) => {
        this._emit("error",error);
    }

    private static _getClientPoolSize(maxClientPoolSize: number, brokerCount: number): number {
        return Math.min(parseInt(Math.max(-0.8 * brokerCount + 1
            + maxClientPoolSize,1) as any),maxClientPoolSize);
    }

    // noinspection JSUnusedGlobalSymbols
    getCurrentSubscriptions(includePending: boolean = false): string[] {
        const subscriptions: string[] = [];
        const clientPools: ClientPool[] = Object.values(this._brokerClientMap);
        for(let i = 0; i < clientPools.length; i++)
            subscriptions.push(...clientPools[i].getSubscriptions(includePending))
        return subscriptions.filter(distinctArrayFilter);
    }

    private updateToBrokerUris() {
        let newBrokerClientMap = {}, i: number, uri: string, tempClientPool: ClientPool,
            length: number, channelLookup: Record<string,boolean>, tempSubscriptions: string[]

        length = this._brokerUris.length;
        //The new pool size is only used for new client pools, and old client pools will keep the size.
        // (They can't be changed because of the hashed channels)
        const poolSize = BrokerClusterClient._getClientPoolSize(this._maxClientPoolSize,length);
        const mappedSubscriptions = this._getMappedSubscriptions();
        for(i = 0; i < length; i++) {
            uri = this._brokerUris[i];
            tempClientPool = this._brokerClientMap[uri];
            channelLookup = mappedSubscriptions[uri] || {};
            if(tempClientPool) {
                //reuse client pool

                newBrokerClientMap[uri] = tempClientPool;

                //update subscriptions of existing client pool
                //cancel old subscriptions
                tempSubscriptions = tempClientPool.getSubscriptions(true);
                tempSubscriptions.forEach(channel => {
                    if (!channelLookup[channel])
                        tempClientPool.unsubscribe(channel);
                });
                //add new subscriptions
                Object.keys(channelLookup).forEach((channel) => {
                    if(tempSubscriptions.indexOf(channel) === -1)
                        tempClientPool.subscribe(channel);
                })
                continue;
            }
            tempClientPool = new ClientPool({
                clusterVersion: CLUSTER_VERSION,
                joinTokenSecret: this._joinTokenSecret,
                uri,
                poolSize
            });
            tempClientPool.onPublish = this._processClientPoolPublishEvent;
            tempClientPool.onError = this._handleClientPoolError;
            newBrokerClientMap[uri] = tempClientPool;

            //add new subscriptions
            Object.keys(channelLookup).forEach((channel) => {
                tempClientPool.subscribe(channel);
            })
        }

        //Cleanup not anymore needed client pools.
        const createdClientUris = Object.keys(this._brokerClientMap);
        length = createdClientUris.length;
        for(i = 0; i < length; i++) {
            uri = createdClientUris[i];
            if(!newBrokerClientMap[uri]) this._brokerClientMap[uri].cleanUp();
        }

        this._brokerClientMap = newBrokerClientMap;
        this._emit("brokersClientPoolsUpdate");
    }

    private _getMappedSubscriptions(): Record<string,Record<string,boolean>> {
        const currentSubscriptions = this._internalBroker.getSubscriptionList();
        let map = {}, i: number, channel: string, targetUri: string | null;
        for(i = 0; i < currentSubscriptions.length; i++) {
            channel = currentSubscriptions[i];
            targetUri = this._selectBrokerFromChannel(channel);
            if(!targetUri) continue;
            if (!map[targetUri]) map[targetUri] = {};
            map[targetUri][channel] = true;
        }
        return map;
    }

    private _selectBrokerFromChannel(channel: string): string | null {
        return this._mapper.findSite(channel);
    }

    private _selectClientPoolFromChannel(channel: string): ClientPool | null | undefined {
        const brokerUri = this._selectBrokerFromChannel(channel);
        return brokerUri != null ? this._brokerClientMap[brokerUri] : null;
    }

    private async _tryWaitForClientPoolsUpdate() {
        try {await this.once('brokersClientPoolsUpdate',5000);}
        catch (_) {
            //ignore timeout errors}
        }
    }

    /*
     * Duplicated code for performance tweaking.
     * Can not split the getting of the client pool because it
     * is happening asynchronously (in rare bad cases (when waiting for an update)).
     * The getting of the client pool and the action execution can not occur asynchronously.
     * Otherwise, the client pool may be disconnected when using it.
     */
    publish(channel: string, data: any, processComplexTypes: boolean): void {
        let clientPool = this._selectClientPoolFromChannel(channel);
        if(clientPool) {
            clientPool.publish(channel,data,processComplexTypes);
            return;
        }
        this._tryWaitForClientPoolsUpdate().then(() => {
            clientPool = this._selectClientPoolFromChannel(channel);
            if(clientPool) return clientPool.publish(channel,data,processComplexTypes);
            this._emit("error",new NoMatchingBrokerClientError(channel));
        })
    }
    subscribe(channel: string): void {
        let clientPool = this._selectClientPoolFromChannel(channel);
        if(clientPool) {
            clientPool.subscribe(channel);
            return;
        }
        this._tryWaitForClientPoolsUpdate().then(() => {
            clientPool = this._selectClientPoolFromChannel(channel);
            if(clientPool) return clientPool.subscribe(channel);
            this._emit("error",new NoMatchingBrokerClientError(channel));
        })
    }
    unsubscribe(channel: string): void {
        let clientPool = this._selectClientPoolFromChannel(channel);
        if(clientPool) {
            clientPool.unsubscribe(channel);
            return;
        }
        this._tryWaitForClientPoolsUpdate().then(() => {
            clientPool = this._selectClientPoolFromChannel(channel);
            if(clientPool) return clientPool.unsubscribe(channel);
            this._emit("error",new NoMatchingBrokerClientError(channel));
        })
    }
}