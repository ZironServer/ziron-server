/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import Socket from "../Socket";
import {Transport} from "ziron-engine";
import {InternalServerTransmits} from "ziron-events";
import {defaultExternalBrokerClient, ExternalBrokerClient} from "./ExternalBrokerClient";
import Exchange from "../Exchange";
import Server from "../Server";
import {Block} from "../MiddlewareUtils";
import {distinctArrayFilter} from "../Utils";

export default class InternalBroker {

    externalBrokerClient: ExternalBrokerClient = defaultExternalBrokerClient;

    public readonly exchange: Exchange;

    private readonly channels: Record<string,Socket[]> = {};
    private readonly exchangeChannels: string[] = [];

    private readonly _server: Server;
    private readonly _publishToPublisher: boolean;

    constructor(server: Server) {
        this._server = server;
        this._publishToPublisher = server._options.publishToPublisher;
        this.exchange = new Exchange({
            subscriptions: this.exchangeChannels,
            subscribe: this._exchangeSubscribe.bind(this),
            unsubscribe: this._exchangeUnsubscribe.bind(this),
            publish: this.publish.bind(this)
        });
    }

    getSubscriptionList(): string[] {
        return [...this.exchangeChannels,...Object.keys(this.channels)].filter(distinctArrayFilter);
    }

    processExternalPublish(channel: string, data: any, complexDataType: boolean) {
        this._processPublish(channel,data,complexDataType,true);
    }

    private _exchangeSubscribe(channel: string) {
        if(!this.exchangeChannels.includes(channel)) {
            this.exchangeChannels.push(channel);
            if(!this.channels[channel])
                this.externalBrokerClient.subscribe(channel);
        }
    }

    private _exchangeUnsubscribe(channel: string) {
        const index = this.exchangeChannels.indexOf(channel);
        if(index !== -1) {
            this.exchangeChannels.splice(index,1);
            if(!this.channels[channel])
                this.externalBrokerClient.unsubscribe(channel);
        }
    }

    socketSubscribe(socket: Socket, channel: string) {
        let sockets = this.channels[channel];
        if(!sockets) {
            this.channels[channel] = sockets = [];
            if(!this.exchangeChannels.includes(channel))
                this.externalBrokerClient.subscribe(channel);
        }
        if(!sockets.includes(socket)) sockets.push(socket);
    }

    socketUnsubscribe(socket: Socket, channel: string) {
        const sockets = this.channels[channel];
        if(sockets) {
            const index = sockets.indexOf(socket);
            if(index !== -1) {
                sockets.splice(index,1);
                if(sockets.length === 0) {
                    delete this.channels[channel];
                    if(!this.exchangeChannels.includes(channel))
                        this.externalBrokerClient.unsubscribe(channel);
                }
            }
        }
    }

    publish(channel: string, data: any, processComplexTypes: boolean = false, publisher?: Socket) {
        this.externalBrokerClient.publish(channel,data,processComplexTypes);
        this._processPublish(channel,data,processComplexTypes,false,
            this._publishToPublisher ? undefined : publisher);
    }

    _processPublish(channel: string, data: any, processComplexTypes: boolean, external: boolean, skipSocket?: Socket) {
        if(this.exchangeChannels.includes(channel)) this.exchange._emitPublish(channel,data,external);
        const sockets = this.channels[channel];
        if(sockets) {
            const preparedPackage = Transport.prepareMultiTransmit
                (InternalServerTransmits.Publish,[channel,data],{processComplexTypes});
            if(!this._server.publishOutMiddleware) {
                const len = sockets.length;
                // optimization tweak
                if(skipSocket) {
                    for(let i = 0; i < len; i++) {
                        if(sockets[i] === skipSocket) continue;
                        sockets[i].sendPreparedPackage(preparedPackage);
                    }
                }
                else for(let i = 0; i < len; i++) sockets[i].sendPreparedPackage(preparedPackage);
            }
            else {
                const middleware = this._server.publishOutMiddleware;
                sockets.forEach(async (socket) => {
                    if(socket === skipSocket) return;
                    try {
                        await middleware(socket,channel,data);
                        socket.sendPreparedPackage(preparedPackage);
                    }
                    catch (err) {if(!(err instanceof Block)) this._server._emit('error', err);}
                })
            }
        }
    }

    /**
     * [Use this method only when you know what you do.]
     */
    terminate() {
        this.externalBrokerClient.terminate();
    }
}