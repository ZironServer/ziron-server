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
} from "zation-core-errors";
import Server from "./Server";
import {WebSocket} from "z-uws";
import * as HTTP from "http";
import {Writable} from "./Utils";
import {BadConnectionType, Transport, DataType, InvokeListener, TransmitListener} from "ziron-engine";
import {InternalServerProcedures, InternalServerReceivers, InternalServerTransmits} from "zation-core-events";
import {SignOptions} from "jsonwebtoken";

type LocalEventEmitter = EventEmitter<{
    'error': [Error],
    'warning': [Error],
    'disconnect': [number | undefined, any],
    'authTokenChange': [object | null,object | null]
}>;

type ReceiverListener = (data: any, type: DataType) => void | Promise<void>;
type ProcedureListener = (data: any,end: (data?: any) => void,reject: (err?: any) => void, type: DataType) => void | Promise<void>

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
    };
    /**
     * @description
     * Will be called whenever no corresponding Procedure was found.
     * Can be overridden.
     */
    public onUnknownInvoke: InvokeListener = () => {};

    public readonly receivers: Receivers = {
        [InternalServerReceivers.Deauthenticate]: this._deauthenticate.bind(this),
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

    constructor(server: Server, socket: WebSocket, upgradeRequest: HTTP.IncomingMessage, handshakeAttachment: any) {
        this._server = server;
        this._socket = socket;

        this.request = upgradeRequest;
        this.handshakeAttachment = handshakeAttachment;

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
        socket.on('message',this._transport.emitMessage.bind(this._transport));
    }

    public readonly transmit: Transport['transmit'];
    public readonly invoke: Transport['invoke'];
    public readonly sendPreparedPackage: Transport['sendPreparedPackage'];

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

        this._clearListener();
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

}