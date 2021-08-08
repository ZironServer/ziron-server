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
import {ServerProtocolError} from "ziron-errors";
import {parseJoinToken, Writable} from "./Utils";
import {InternalServerTransmits} from "ziron-events";
import {Block} from "./MiddlewareUtils";
import Exchange from "./Exchange";
import InternalBroker from "./broker/InternalBroker";
import * as uniqId from "uniqid";
import StateClient from "./StateClient";
import BrokerClusterClient from "./broker/brokerClusterClient/BrokerClusterClient";
import {EMPTY_FUNCTION} from "./Constants";

declare module "http" {
    interface IncomingMessage {attachment?: any}
}

type LocalEventEmitter = EventEmitter<{
    'error': [Error],
    'warning': [Error],
    'badSocketAuthToken': [Socket,Error,string],
    'disconnection': [Socket,number,any]
}>;

type HandshakeMiddleware = (req: HTTP.IncomingMessage | {attachment?: any}) => Promise<void> | void;
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
        id: uniqId(),
        join: null,
        maxPayload: null,
        perMessageDeflate: null,
        socketChannelLimit: 1000,
        allowClientPublish: true,
        publishToPublisher: true,
        ackTimeout: 7000,
        authTokenExpireCheckInterval: 12000,
        pingInterval: 8000,
        origins: null,
        port: 3000,
        path: '/',
        auth: {},
        healthCheckEndpoint: true,
        clusterJoinPayload: {},
        clusterShared: {},
        httpServer: null,
        brokerClusterClientMaxPoolSize: 12
    };

    private readonly _joinToken: {secret: string, uri: string};
    public readonly stateClientConnection?: Promise<void>;
    public readonly stateClient?: StateClient;
    public readonly originsChecker: OriginsChecker;
    public readonly auth: AuthEngine;

    get id(): string {
        return this._options.id;
    }

    get port(): number {
        return this._options.port;
    }

    get path(): string {
        return this._options.path;
    }

    get leader(): boolean {
        return this.stateClient?.leader ?? false;
    }

    private _authTokenExpireCheckerTicker: NodeJS.Timeout;
    private readonly _httpServer: HTTP.Server | HTTPS.Server;
    private readonly _wsServer: WebSocketServer;

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

    public connectionHandler: (socket: Socket) => Promise<any> | any = EMPTY_FUNCTION;

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

        this._options.path = this._options.path === "" || this._options.path === "/" ? "" :
            !this._options.path.startsWith("/") ? "/" + this._options.path : this._options.path;

        this._joinToken = parseJoinToken(this._options.join || '');

        this.stateClient = this._setUpStateClient();
        if(this.stateClient != null) this.stateClientConnection = this.stateClient.connect();
        this.auth = new AuthEngine(this._options.auth);
        this.originsChecker = createOriginsChecker(this._options.origins);

        this.internalBroker = new InternalBroker(this);
        if(this.stateClient != null) {
            this.internalBroker.externalBrokerClient = new BrokerClusterClient(this.stateClient,this.internalBroker,{
                joinTokenSecret: this._joinToken.secret,
                maxClientPoolSize: this._options.brokerClusterClientMaxPoolSize
            });
        }
        this.exchange = this.internalBroker.exchange;

        this._setUpSocketChLimit();
        if(this._options.httpServer) {
            this._checkHttpServerPort();
            this._httpServer = this._options.httpServer;
        }
        else this._httpServer = this._createBasicHttpServer();

        if(this._options.healthCheckEndpoint) this._initHealthCheck();
        this._wsServer = this._setUpWsServer();

    }

    private _setUpStateClient() {
        if(this._options.join == null) return undefined;
        return new StateClient({
            id: this._options.id,
            port: this._options.port,
            path: this._options.path,
            joinTokenUri: this._joinToken.uri,
            joinTokenSecret: this._joinToken.secret,
            joinPayload: this._options.clusterJoinPayload,
            sharedData: this._options.clusterShared
        });
    }

    private _setUpSocketChLimit() {
        if(this._options.socketChannelLimit != null) {
            const limit = this._options.socketChannelLimit;
            this._checkSocketChLimitReached = (count) => count >= limit;
        }
        else this._checkSocketChLimitReached = () => false;
    }

    private _setUpWsServer() {
        const wsServer = new WebSocketServer({
            server: this._httpServer,
            verifyClient: this._verifyClient.bind(this),
            path: this._options.path,
            ...(this._options.maxPayload != null ? {maxPayload: this._options.maxPayload} : {}),
            ...(this._options.perMessageDeflate != null ? {perMessageDeflate: this._options.perMessageDeflate} : {}),
        });
        wsServer.startAutoPing(this._options.pingInterval,true);
        this._authTokenExpireCheckerTicker = setInterval(() => {
            for(const id in this.clients) { // noinspection JSUnfilteredForInLoop
                this.clients[id]._checkAuthTokenExpire();
            }
        },this._options.authTokenExpireCheckInterval);
        wsServer.on('error',this._handleServerError.bind(this));
        wsServer.on('connection',this._handleSocketConnection.bind(this));
        return wsServer;
    }

    private _initHealthCheck() {
        this._httpServer.on('request', function (req, res) {
            if (req.url === '/healthCheck') {
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end('OK');
            }
        });
    }

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

    private _checkHttpServerPort() {
        if(this._httpServer.listening) {
            const addressInfo = this._httpServer.address();
            if(typeof addressInfo !== 'object' || addressInfo?.port !== this._options.port)
                throw new Error('The provided HTTP server is already listening to a different port than defined in the server options.')
        }
    }

    public async listen(): Promise<void> {
        this._checkHttpServerPort();
        if(!this._httpServer.listening) return new Promise(res => {
            this._httpServer.listen(this._options.port,() => res());
        });
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
    _checkSocketChLimitReached: (count: number) => boolean;

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

    /**
     * Terminates the server.
     * After termination, you should not use this instance anymore
     * or anything else from the server.
     * [Use this method only when you know what you do.]
     */
    terminate() {
        this._wsServer.close();
        this._httpServer.close();
        Object.values(this.clients).forEach(client => client._terminate());
        (this as Writable<Server>).clients = {};
        (this as Writable<Server>).clientCount = 0;
        this.stateClient?.disconnect();
        this.internalBroker._terminate();
    }
}