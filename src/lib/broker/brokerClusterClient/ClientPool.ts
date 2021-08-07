/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {SocketOptions,Socket} from "ziron-client";
import {hashToIndex} from "../../Utils";
import {DataType} from "ziron-engine";
import {EMPTY_FUNCTION} from "../../Constants";
import {NamedError} from "ziron-errors";

export interface ClientPoolOptions {
    poolSize: number,
    uri: string,
    joinTokenSecret: string,
    clusterVersion: number,
}

export default class ClientPool {

    public onError: (err: Error) => void = EMPTY_FUNCTION;
    public onPublish: (channel: string, data: any, type: DataType) => void = EMPTY_FUNCTION;

    private readonly _options: ClientPoolOptions;
    private readonly clientOptions: SocketOptions;

    private clients: Socket[] = [];

    constructor(options: ClientPoolOptions) {
        this._options = options;
        this.clientOptions = this._buildSocketOptions();
        if(this._options.poolSize < 1) throw new Error("Pool size must be greater than 0");
        this._fillPool();
    }

    private _fillPool() {
        const poolSize = this._options.poolSize;
        let tempSocket: Socket;
        for(let i = 0; i < poolSize; i++) {
            tempSocket = new Socket({...this.clientOptions});
            tempSocket.on("error",this._handleClientError);
            tempSocket.onPublish(this._handleClientPublish);
            this.clients[i] = tempSocket;
        }
    }

    private _selectClient(key: string): Socket {
        return this.clients[hashToIndex(key,this.clients.length)];
    }

    private _handleClientError = (error: Error) => {
        this.onError(new NamedError("PoolClientError", error.stack));
    }

    private _handleClientSubscribeFail = (err: any) => {
        this.onError(new NamedError("PoolClientSubscribeFail", err));
    }

    private _handleClientPublish = (channel: string, data: any, dataType: DataType) => {
        this.onPublish(channel,data,dataType);
    }

    private _buildSocketOptions(): SocketOptions {
        return Object.assign(Socket.parseOptionsFromUrl(this._options.uri),{
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
                secret: this._options.joinTokenSecret,
                clusterVersion: this._options.clusterVersion
            }
        } as SocketOptions);
    }

    async subscribe(channel: string): Promise<void> {
        try {return this._selectClient(channel).subscribe(channel);}
        catch (err) {this._handleClientSubscribeFail(err);}
    }

    unsubscribe(channel: string): Promise<void> {
        return this._selectClient(channel).unsubscribe(channel);
    }

    publish(channel: string, data: any, processComplexTypes: boolean) {
        this._selectClient(channel).publish(channel,data,{processComplexTypes});
    }

    getSubscriptions(includePending: boolean = false): string[] {
        const subscriptions: string[] = [];
        for(let i = 0; i < this.clients.length; i++)
            subscriptions.push(...this.clients[i].getSubscriptions(includePending))
        return subscriptions;
    }

    // noinspection JSUnusedGlobalSymbols
    hasSubscribed(channel: string,includePending: boolean = false): boolean {
        return this._selectClient(channel).hasSubscribed(channel,includePending);
    }

    cleanUp() {
        const length = this.clients.length;
        let client: Socket;
        for(let i = 0; i < length; i++) {
            client = this.clients[i];
            client.disconnect();
            client.unsubscribe();
            client.off();
            client.removeAllChannelListener();
        }
    }
}