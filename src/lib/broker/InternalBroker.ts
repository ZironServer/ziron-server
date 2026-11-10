/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Socket from "../Socket";
import {JSONString, Transport} from "ziron-engine";
import {InternalServerTransmits} from "ziron-events";
import {defaultExternalBrokerClient, ExternalBrokerClient} from "./ExternalBrokerClient";
import ChannelExchange from "../ChannelExchange";
import Server from "../Server";

export default class InternalBroker {

    externalBrokerClient: ExternalBrokerClient = defaultExternalBrokerClient;

    public readonly exchange: ChannelExchange;

    private readonly exchangeChannels: Set<string> = new Set();
    private readonly socketSubscriptions: Set<string> = new Set();

    private readonly _server: Server;
    private readonly _publishToPublisher: boolean;

    constructor(server: Server<any,any>) {
        this._server = server;
        this._publishToPublisher = server.options.publishToPublisher;
        this.exchange = new ChannelExchange({
            subscriptions: this.exchangeChannels,
            subscribe: this._exchangeSubscribe.bind(this),
            unsubscribe: this._exchangeUnsubscribe.bind(this),
            publish: (channel,data,options) => {
                this.publish(channel,data,options?.processComplexTypes,options?.publisher);
            },
            isSubscriptionActive: channel => this.externalBrokerClient.isSubscriptionActive ?
                this.externalBrokerClient.isSubscriptionActive(channel) : true
        });
    }

    getSubscriptions(): string[] {
        return Array.from(new Set([...this.exchangeChannels,...this.socketSubscriptions]).values());
    }

    processExternalPublish(channel: string, data: any, complexDataType: boolean) {
        this._processPublish(channel,data,complexDataType,true);
    }

    /**
     * Called by the external broker client when the subscription of a channel became active or was cut.
     */
    processSubscriptionChange(channel: string, active: boolean) {
        this.exchange._emitSubscriptionChange(channel,active);
    }

    /**
     * Called by the external broker client when a publish may not have reached the broker.
     */
    processPublishLoss(channel: string) {
        this.exchange._emitPublishLoss(channel);
    }

    private _exchangeSubscribe(channel: string) {
        if(!this.exchangeChannels.has(channel)) {
            this.exchangeChannels.add(channel);
            if(!this.socketSubscriptions.has(channel))
                this.externalBrokerClient.subscribe(channel);
        }
    }

    private _exchangeUnsubscribe(channel: string) {
        if(this.exchangeChannels.delete(channel)) {
            if(!this.socketSubscriptions.has(channel))
                this.externalBrokerClient.unsubscribe(channel);
        }
    }

    socketSubscribe(socket: Socket, channel: string) {
        if(!socket.open) return;
        if(!this.socketSubscriptions.has(channel)) {
            if(!this.exchangeChannels.has(channel))
                this.externalBrokerClient.subscribe(channel);
            this.socketSubscriptions.add(channel);
        }
        socket._socket.subscribe("C" + channel);
    }

    socketUnsubscribe(socket: Socket, channel: string) {
        if(this.socketSubscriptions.has(channel)) {
            const internalCh = "C" + channel;
            if(socket.open) socket._socket.unsubscribe(internalCh);
            if(this._server._app.numSubscribers(internalCh) <= 0) {
                this.socketSubscriptions.delete(channel);
                if(!this.exchangeChannels.has(channel))
                    this.externalBrokerClient.unsubscribe(channel);
            }
        }
    }

    publish(channel: string, data: any, processComplexTypes: boolean = false, publisher?: Socket) {
        this.externalBrokerClient.publish(channel,data,processComplexTypes);
        this._processPublish(channel,data,processComplexTypes,false,
            this._publishToPublisher ? undefined : publisher);
    }

    _processPublish(channel: string, data: any, processComplexTypes: boolean, external: boolean, publisher?: Socket) {
        if(this.exchangeChannels.has(channel)) this.exchange._emitPublish(channel,data,external,processComplexTypes);
        if(this.socketSubscriptions.has(channel)) {
            //prepared JSON (a JSONString) goes in as it is: the same message as from the value
            const pack = Transport.prepareMultiTransmit(InternalServerTransmits.Publish,data instanceof JSONString ?
                new JSONString('[' + JSON.stringify(channel) + ',' + data.toString() + ']') : [channel,data],{processComplexTypes});
            const source = (publisher && publisher.open) ? publisher._socket : this._server._app,
                len = pack.length,
                internalChannel = "C" + channel;

            source.publish(internalChannel,pack[0],
                false,this._server._shouldCompress(pack[0]));
            if(len > 1) source.publish(internalChannel,pack[1]!,
                true,this._server._shouldCompress(pack[1]!,true));
        }
    }

    /**
     * [Use this method only when you know what you do.]
     */
    terminate() {
        this.externalBrokerClient.terminate();
    }
}