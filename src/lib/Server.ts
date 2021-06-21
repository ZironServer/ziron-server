/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import ServerOptions from "./ServerOptions";
import {createOriginsChecker, OriginsChecker} from "./OriginsChecker";
import AuthEngine from "./AuthEngine";
import Socket from "./Socket";
import {ConnectionInfo, VerifyClientNext, WebSocketServer, WebSocket} from 'z-uws';
import * as HTTP from "http";
import * as HTTPS from "https";
import EventEmitter from "emitix";
import {ServerProtocolError} from "zation-core-errors";
import {Writable} from "./Utils";
import {InternalServerTransmits} from "zation-core-events";
import {Block} from "./MiddlewareUtils";
import Exchange from "./Exchange";
import InternalBroker from "./broker/InternalBroker";
import {defaultExternalBrokerClient} from "./broker/ExternalBrokerClient";

declare module "http" {
    interface IncomingMessage {attachment?: any}
}

type LocalEventEmitter = EventEmitter<{
    'error': [Error],
    'warning': [Error],
    'badSocketAuthToken': [Socket,Error,string],
    'disconnection': [Socket,number,any]
}>;

type HandshakeMiddleware = (req: HTTP.IncomingMessage) => Promise<void> | void;
type SocketMiddleware = (socket: Socket) => Promise<void> | void;
type AuthenticateMiddleware = (socket: Socket, authToken: object, signedAuthToken: string) => Promise<void> | void;
type SubscribeMiddleware = (socket: Socket, channel: string) => Promise<void> | void;
type PublishInMiddleware = (socket: Socket, channel: string, data: any) => Promise<void> | void;
type PublishOutMiddleware = (socket: Socket, channel: string, data: any) => Promise<void> | void;

export default class Server {

    /**
     * @internal
     */
    readonly _options: Required<ServerOptions> = {
        join: null,
        maxPayload: null,
        perMessageDeflate: null,
        socketChannelLimit: 1000,
        allowClientPublish: true,
        ackTimeout: 7000,
        authTokenExpireCheckInterval: 12000,
        pingInterval: 8000,
        origins: null,
        path: '/ziron',
        auth: {},
        healthCheckEndpoint: true
    };

    public readonly originsChecker: OriginsChecker;
    public readonly auth: AuthEngine;

    private _authTokenExpireCheckerTicker: NodeJS.Timeout;
    private _wsServer: WebSocketServer;

    private _localEmitter: LocalEventEmitter = new EventEmitter();
    public readonly once: LocalEventEmitter['once'] = this._localEmitter.once.bind(this._localEmitter);
    public readonly on: LocalEventEmitter['on'] = this._localEmitter.on.bind(this._localEmitter);
    public readonly off: LocalEventEmitter['off'] = this._localEmitter.off.bind(this._localEmitter);
    /**
     * @internal
     */
    public readonly _emit: LocalEventEmitter['emit'] = this._localEmitter.emit.bind(this._localEmitter);

    public readonly clientCount: number = 0;
    public readonly clients: Record<string, Socket> = {};

    public connectionHandler: (socket: Socket) => Promise<any> | any = () => {};

    //Middlewares
    public handshakeMiddleware: HandshakeMiddleware | undefined;
    public socketMiddleware: SocketMiddleware | undefined;
    public authenticateMiddleware: AuthenticateMiddleware | undefined;
    public subscribeMiddleware: SubscribeMiddleware | undefined;
    public publishInMiddleware: PublishInMiddleware | undefined;
    public publishOutMiddleware: PublishOutMiddleware | undefined;

    /**
     * @internal
     */
    public internalBroker: InternalBroker;

    public exchange: Exchange;
    public refuseConnections: boolean = false;

    constructor(options: ServerOptions = {}) {
        Object.assign(this._options,options);

        this.auth = new AuthEngine(this._options.auth);
        this.originsChecker = createOriginsChecker(this._options.origins);

        this.internalBroker = new InternalBroker(this);
        this.internalBroker.externalBrokerClient = defaultExternalBrokerClient;
        this.exchange = this.internalBroker.exchange;

        if(this._options.socketChannelLimit != null) {
            const limit = this._options.socketChannelLimit;
            this._checkSocketChLimitReached = (count) => count >= limit;
        }
        else this._checkSocketChLimitReached = () => false;
    }

    public listen: (port?: number, onListen?: () => void) => void = this._create.bind(this);
    public attach: (httpServer: HTTP.Server | HTTPS.Server) => void = this._create.bind(this);

    private _createBasicHttpServer() {
        const httpServer = HTTP.createServer((_: any, res: HTTP.ServerResponse): void => {
            const body = HTTP.STATUS_CODES[426];
            res.writeHead(426, {
                'Content-Length': body?.length || 0,
                'Content-Type': 'text/plain'
            });
            return res.end(body);
        });
        httpServer.on('error', (err: Error): void => {
            this._emit("error",err);
        });
        return httpServer;
    }

    private _create(port?: number, onListen?: () => void)
    private _create(httpServer: HTTP.Server | HTTPS.Server)
    private _create(http: HTTP.Server | HTTPS.Server | number = 3000, onListen?: () => void) {
        if(this._wsServer) throw new Error('The websocket server is already created.')

        const httpServer = typeof http === 'number' ? this._createBasicHttpServer() : http;

        if(this._options.healthCheckEndpoint) {
            httpServer.on('request', function (req, res) {
                if (req.url === '/healthCheck') {
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end('OK');
                }
            });
        }

        this._wsServer = new WebSocketServer({
            server: httpServer,
            verifyClient: this._verifyClient.bind(this),
            path: this._options.path,
            ...(this._options.maxPayload != null ? {maxPayload: this._options.maxPayload} : {}),
            ...(this._options.perMessageDeflate != null ? {perMessageDeflate: this._options.perMessageDeflate} : {}),
        });

        this._wsServer.startAutoPing(this._options.pingInterval,true);
        this._authTokenExpireCheckerTicker = setInterval(() => {
            for(const id in this.clients) { // noinspection JSUnfilteredForInLoop
                this.clients[id]._checkAuthTokenExpire();
            }
        },this._options.authTokenExpireCheckInterval);

        this._wsServer.on('error',this._handleServerError.bind(this));
        this._wsServer.on('connection',this._handleSocketConnection.bind(this));

        if(typeof http === 'number') httpServer.listen(http,onListen);
    }

    private async _handleSocketConnection(socket: WebSocket, req: HTTP.IncomingMessage) {
        const protocolHeader = req.headers['sec-websocket-protocol'];
        const protocolValue = (Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader) || "";

        const protocolIndexOfAt = protocolValue.indexOf('@');
        const protocolName = protocolIndexOfAt === -1 ? protocolValue : protocolValue.substring(protocolIndexOfAt + 1);
        if(protocolName !== 'ziron') return socket.close(4800,'Unsupported protocol');
        const signedToken = protocolIndexOfAt !== -1 ? protocolValue.substring(0,protocolIndexOfAt) : null;

        const zSocket = new Socket(this,socket,req);
        (this as Writable<Server>).clientCount++;
        this.clients[zSocket.id] = zSocket;

        try {
            if(this.socketMiddleware){
                try {await this.socketMiddleware(zSocket);}
                catch (err) {
                    if(err instanceof Block)
                        zSocket.disconnect(err.code,err.message || 'Connection was blocked by socket middleware');
                    else {
                        this._emit('error', err);
                        zSocket.disconnect(err.code ?? 4403,'Connection was blocked by socket middleware');
                    }
                    return;
                }
            }

            let authTokenState;
            if(signedToken) {
                try {await zSocket._processAuthToken(signedToken)}
                catch (err) {authTokenState = (err && err.badAuthToken) ? 2 : 1;}
            }

            const readyData = await this.connectionHandler(zSocket);
            const res = [this._options.pingInterval,authTokenState];
            if(readyData !== undefined) res.push(readyData);
            zSocket.transmit(InternalServerTransmits.ConnectionReady,res);
        }
        catch (err) {
            this._emit('error', err);
            zSocket.disconnect(err.code ?? 1011,'Unknown connection error');
        }
    }

    /**
     * @internal
     * @param socket
     * @private
     */
    _removeSocket(socket: Socket) {
        (this as Writable<Server>).clientCount--;
        delete this.clients[socket.id];
    }

    /**
     * @internal
     * @param count
     * @private
     */
    readonly _checkSocketChLimitReached: (count: number) => boolean;

    private _handleServerError(error: string | Error) {
        this._emit('error',typeof error === 'string' ? new ServerProtocolError(error) : error);
    }

    private _verifyClient(info: ConnectionInfo, next: VerifyClientNext) {
        if(this.refuseConnections) return next(false,403);
        if(!this.originsChecker(info.origin)) {
            const err = new ServerProtocolError('Failed to authorize socket handshake - Invalid origin: ' + origin);
            this._emit('warning', err);
            return next(false, 403, err.message);
        }

        const req = info.req;
        const url = req.url || '';
        const urlIndexOfSearch = url.indexOf('?');
        const queryArgs = urlIndexOfSearch !== -1 ? url.substring(url.indexOf('?') + 1) : '';
        if(queryArgs.length){
            try {
                const parsedArgs = JSON.parse(decodeURIComponent(queryArgs));
                if(parsedArgs) req.attachment = parsedArgs;
            }
            catch (_) {}
        }

        if(this.handshakeMiddleware){
            (async () => {
                try {
                    await this.handshakeMiddleware!(req);
                    next(true);
                }
                catch (err) {
                    if(err instanceof Block) next(false, err.code, err.message || 'Handshake was blocked by handshake middleware');
                    else {
                        this._emit('error', err);
                        next(false, err.code ?? 403, 'Handshake was blocked by handshake middleware');
                    }
                }
            })();
        }
        else next(true);
    }
}