/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import * as base64 from 'base64id';
import EventEmitter from "emitix";
import {
    InvalidArgumentsError,
    SocketProtocolError,
    socketProtocolErrorStatuses,
    socketProtocolIgnoreStatuses,
} from "ziron-errors";
import Server from "./Server";
import {WebSocket} from "z-uws";
import * as HTTP from "http";
import {Writable} from "./Utils";
import {
    BadConnectionType,
    Transport,
    DataType,
    InvokeListener,
    TransmitListener,
    InvalidActionError
} from "ziron-engine";
import {InternalServerProcedures, InternalServerReceivers, InternalServerTransmits} from "ziron-events";
import {SignOptions} from "jsonwebtoken";
import {Block} from "./MiddlewareUtils";
import {NOT_OPEN_FAILURE_FUNCTION} from "./Constants";

type LocalEventEmitter = EventEmitter<{
    'error': [Error],
    'warning': [Error],
    'disconnect': [number | undefined, any],
    'authTokenChange': [object | null,object | null]
}>;

export type ReceiverListener = (data: any, type: DataType) => void | Promise<void>;
export type ProcedureListener = (data: any,end: (data?: any) => void,reject: (err?: any) => void, type: DataType) => void | Promise<void>

type Receivers =
    { readonly [key in InternalServerReceivers]: ReceiverListener } &
    {[key: string]: ReceiverListener | undefined}

type Procedures =
    { readonly [key in InternalServerProcedures]: ProcedureListener } &
    {[key: string]: ProcedureListener | undefined}

export default class Socket
{
    public readonly id : string = base64.generateId();

    public readonly open: boolean = true;

    public readonly signedAuthToken: string | null = null;
    public readonly authToken: any | null = null;
    public readonly authenticated: boolean = false;
    private setAuth<PT extends null | object>(authToken: PT, signedAuthToken: PT extends null ? null : string) {
        const oldAuthToken = this.authToken;
        (this as Writable<Socket>).authToken = authToken;
        (this as Writable<Socket>).signedAuthToken = signedAuthToken;
        (this as Writable<Socket>).authenticated = authToken != null;
        if(oldAuthToken !== authToken)
            this._emit('authTokenChange',authToken,oldAuthToken);
    };

    private readonly _localEmitter: LocalEventEmitter = new EventEmitter();
    public readonly once: LocalEventEmitter['once'] = this._localEmitter.once.bind(this._localEmitter);
    public readonly on: LocalEventEmitter['on'] = this._localEmitter.on.bind(this._localEmitter);
    public readonly off: LocalEventEmitter['off'] = this._localEmitter.off.bind(this._localEmitter);
    private readonly _emit: LocalEventEmitter['emit'] = this._localEmitter.emit.bind(this._localEmitter);

    public readonly procedures: Procedures = {
        [InternalServerProcedures.Authenticate]: this._handleAuthenticateInvoke.bind(this),
        [InternalServerProcedures.Subscribe]: this._handleSubscribeInvoke.bind(this),
        [InternalServerProcedures.Publish]: this._handleClientPublishInvoke.bind(this)
    };
    /**
     * @description
     * Will be called whenever no corresponding Procedure was found.
     * Can be overridden.
     */
    public onUnknownInvoke: InvokeListener = () => {};

    public readonly receivers: Receivers = {
        [InternalServerReceivers.Deauthenticate]: this._deauthenticate.bind(this),
        [InternalServerReceivers.Publish]: this._handleClientPublishTransmit.bind(this),
        [InternalServerReceivers.Unsubscribe]: this._handleUnsubscribeTransmit.bind(this)
    };
    /**
     * @description
     * Will be called whenever no corresponding Receiver was found.
     * Can be overridden.
     */
    public onUnknownTransmit: TransmitListener = () => {};

    private readonly _server: Server;
    private readonly _socket: WebSocket;
    readonly request: any;
    readonly handshakeAttachment: any;

    public readonly remotePort: number | string | null;
    public readonly remoteAddress: string | null;
    public readonly remoteFamily: string | null;

    public readonly subscriptions: ReadonlyArray<string> = [];

    private readonly _transport: Transport;

    constructor(server: Server, socket: WebSocket, upgradeRequest: HTTP.IncomingMessage) {
        this._server = server;
        this._socket = socket;

        this.request = upgradeRequest;
        this.handshakeAttachment = upgradeRequest.attachment;

        const addresses = this._socket._socket;
        this.remoteAddress = addresses.remoteAddress || null;
        this.remoteFamily = addresses.remoteFamily || null;
        this.remotePort = addresses.remotePort || null;

        socket.on('error', err => this._localEmitter.emit('error',err));
        socket.on('close', (code, reason) => this._destroy(code || 1001, reason));

        this._transport = new Transport({
            send: this._sendRaw.bind(this),
            onListenerError: err => this._localEmitter.emit('error',err),
            onInvalidMessage: () => this._destroy(4400,'Bad message'),
            onInvoke: this._onInvoke.bind(this),
            onTransmit: this._onTransmit.bind(this)
        },true)
        this._transport.ackTimeout = server._options.ackTimeout
        this.transmit = this._transport.transmit.bind(this._transport);
        this.invoke = this._transport.invoke.bind(this._transport);
        this.sendPreparedPackage = this._transport.sendPreparedPackage.bind(this._transport);
        this.flushBuffer = this._transport.flushBuffer.bind(this._transport);
        this.getBufferSize = this._transport.getBufferSize.bind(this._transport);
        socket.on('message',this._transport.emitMessage.bind(this._transport));
    }

    public readonly transmit: Transport['transmit'];
    public readonly invoke: Transport['invoke'];
    public readonly sendPreparedPackage: Transport['sendPreparedPackage'];
    public readonly flushBuffer: Transport['flushBuffer'];
    public readonly getBufferSize: Transport['getBufferSize'];

    private _sendRaw(data: string | Buffer | ArrayBuffer) {
        try {this._socket.send(data);}
        catch (err) {this._destroy(1006, err.toString())}
    }

    private _clearListener() {
        this._localEmitter.off();
    }

    private _destroy(code: number, reason?: string) {
        (this as Writable<Socket>).open = false;
        this._transport.emitBadConnection(BadConnectionType.Disconnect)
        this._transport.clearBuffer();
        (this as Writable<Socket>).transmit = NOT_OPEN_FAILURE_FUNCTION;
        (this as Writable<Socket>).invoke = NOT_OPEN_FAILURE_FUNCTION;
        (this as Writable<Socket>).sendPreparedPackage = NOT_OPEN_FAILURE_FUNCTION;
        this._emit('disconnect', code, reason);
        this._server._emit('disconnection', this, code, reason);

        if (!socketProtocolIgnoreStatuses[code]) {
            this._emit('error', new SocketProtocolError(socketProtocolErrorStatuses[code] ||
                (`Socket connection closed with status: ${code}` + (reason ? (` and reason: ${reason}.`) : '.')), code));
        }

        this._unsubscribeAll();
        this._clearListener();
        this._server._removeSocket(this);
    }

    public isAuthTokenExpired(): boolean {
        if (this.authToken && this.authToken.exp != null)
            return Date.now() > this.authToken.exp * 1000
        return false;
    }

    /**
     * @internal
     * @private
     */
    public _checkAuthTokenExpire() {
        if(this.isAuthTokenExpired()) this.deauthenticate();
    }

    /**
     * @internal
     */
    public _deauthenticate() {
        if(!this.authenticated) return;
        this.setAuth(null,null);
    }

    public deauthenticate() {
        this._deauthenticate();
        this.transmit(InternalServerTransmits.RemoveAuthToken);
    }

    public async authenticate(payload: Record<string,any>, options?: SignOptions) {
        const signedAuthToken = await this._server.auth.signToken(payload,options);
        this.setAuth(payload,signedAuthToken);
        this.transmit(InternalServerTransmits.SetAuthToken,signedAuthToken);
    }

    public disconnect(code?: number, reason?: string) {
        code = code || 1000;
        if (this.open) {
            this._destroy(code, reason);
            this._socket.close(code, reason);
        }
    }

    private async _handleAuthenticateInvoke(signedAuthToken: any, end: (data?: any) => void, reject: (err?: any) => void) {
        try {
            await this._processAuthToken(signedAuthToken);
            end();
        }
        catch (err) {reject(err)}
    }

    /**
     * @internal
     * @param signedAuthToken
     * @private
     */
    async _processAuthToken(signedAuthToken: string) {
        try {
            const plainAuthToken = await this._server.auth.verifyToken(signedAuthToken);
            if(this._server.authenticateMiddleware)
                await this._server.authenticateMiddleware(this, plainAuthToken, signedAuthToken);
            this.setAuth(plainAuthToken,signedAuthToken);
        }
        catch (err) {
            if(err && err.badAuthToken) this._server._emit('badSocketAuthToken',this,err,signedAuthToken);
            throw err;
        }
    }

    private _onInvoke(event: string,data: any,end: (data?: any) => void,reject: (err?: any) => void, type: DataType) {
        if(this.procedures[event]) return this.procedures[event]!(data,end,reject,type);
        this.onUnknownInvoke(event,data,end,reject,type);
    }

    private _onTransmit(event: string,data: any,type: DataType) {
        if(this.receivers[event]) return this.receivers[event]!(data,type);
        this.onUnknownTransmit(event,data,type);
    }

    // noinspection JSUnusedGlobalSymbols
    kickOut(channel: string, data?: any) {
        const index = this.subscriptions.indexOf(channel);
        if(index !== -1) {
            this._server.internalBroker.socketUnsubscribe(this,channel);
            (this.subscriptions as string[]).splice(index,1);
            this.transmit(InternalServerTransmits.KickOut,[channel,data]);
        }
    }

    private async _handleSubscribeInvoke(channel: any, end: (data?: any) => void, reject: (err?: any) => void) {
        if(typeof channel !== "string") return reject(new InvalidArgumentsError('Channel must be a string.'));
        else if(this._server._checkSocketChLimitReached(this.subscriptions.length))
            return reject(new InvalidActionError(`Socket ${this.id} tried to exceed the channel subscription limit of ${
                this._server._options.socketChannelLimit}`));
        else {
            if(this._server.subscribeMiddleware) {
                try {await this._server.subscribeMiddleware(this,channel);}
                catch (err) {
                    if(!(err instanceof Block)) this._server._emit('error', err);
                    return end(4403);
                }
            }
            if(!this.subscriptions.includes(channel)) {
                this._server.internalBroker.socketSubscribe(this,channel);
                (this.subscriptions as string[]).push(channel)
            }
            end();
        }
    }

    private async _handleUnsubscribeTransmit(channel: any) {
        if(typeof channel === "string") {
            const index = this.subscriptions.indexOf(channel);
            if(index !== -1) {
                this._server.internalBroker.socketUnsubscribe(this,channel);
                (this.subscriptions as string[]).splice(index,1);
            }
        }
    }

    private _unsubscribeAll() {
        const len = this.subscriptions.length;
        for(let i = 0; i < len; i++)
            this._server.internalBroker.socketUnsubscribe(this,this.subscriptions[i]);
        (this as Writable<Socket>).subscriptions = [];
    }

    private async _handleClientPublishInvoke(data: any, end: (data?: any) => void, reject: (err?: any) => void, type: DataType) {
        if(!this._server._options.allowClientPublish) return end(4403);
        data = data || [];
        const channel = data[0];
        if(typeof channel !== "string") return reject(new InvalidArgumentsError('Channel must be a string.'));
        if(this._server.publishInMiddleware) {
            try {await this._server.publishInMiddleware(this,channel,data[1]);}
            catch (err) {
                if(!(err instanceof Block)) this._server._emit('error', err);
                return end(4403);
            }
        }
        this._server.internalBroker.publish(channel,data[1],type !== DataType.JSON);
        end();
    }

    private async _handleClientPublishTransmit(data: any, type: DataType) {
        if(!this._server._options.allowClientPublish) return;
        data = data || [];
        const channel = data[0];
        if(typeof channel !== "string") return;
        if(this._server.publishInMiddleware) {
            try {await this._server.publishInMiddleware(this,channel,data[1]);}
            catch (err) {
                if(!(err instanceof Block)) this._server._emit('error', err);
                return;
            }
        }
        this._server.internalBroker.publish(channel,data[1],type !== DataType.JSON);
    }
}