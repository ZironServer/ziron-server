/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
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
import {Writable} from "./Utils";
import {InternalServerTransmits} from "ziron-events";
import {Block} from "./MiddlewareUtils";
import Exchange from "./Exchange";
import InternalBroker from "./broker/InternalBroker";
import * as uniqId from "uniqid";
import {EMPTY_FUNCTION} from "./Constants";
import {PortInUseError} from "./PortInUseError";
import * as Http from "http";

declare module "http" {
    interface IncomingMessage {attachment?: any}
}

type LocalEvents = {
    'error': [Error],
    'warning': [Error],
    'badSocketAuthToken': [Socket,Error,string],
    'disconnection': [Socket,number,any],
};

type HandshakeMiddleware = (req: HTTP.IncomingMessage | {attachment?: any}) => Promise<void> | void;
type SocketMiddleware = (socket: Socket) => Promise<void> | void;
type AuthenticateMiddleware = (socket: Socket, authToken: object, signedAuthToken: string) => Promise<void> | void;
type SubscribeMiddleware = (socket: Socket, channel: string) => Promise<void> | void;
type PublishInMiddleware = (socket: Socket, channel: string, data: any) => Promise<void> | void;
type PublishOutMiddleware = (socket: Socket, channel: string, data: any) => Promise<void> | void;

export default class Server<E extends { [key: string]: any[]; } = {}> {

    protected readonly options: Required<ServerOptions> = {
        id: uniqId(),
        maxPayload: null,
        perMessageDeflate: null,
        socketChannelLimit: 1000,
        allowClientPublish: true,
        publishToPublisher: true,
        ackTimeout: 7000,
        pingInterval: 8000,
        origins: null,
        port: 3000,
        path: '/',
        auth: {},
        healthEndpoint: true,
        tls: null,
        maxHttpHeaderSize: null
    };

    /**
     * @internal
     * Internal access for the socket.
     */
    public readonly _options: Required<ServerOptions>;

    public readonly originsChecker: OriginsChecker;
    public readonly auth: AuthEngine;

    get id(): string {
        return this.options.id;
    }

    get port(): number {
        return this.options.port;
    }

    get path(): string {
        return this.options.path;
    }

    private _authTokenExpireCheckerTicker: NodeJS.Timeout;
    public readonly httpServer: HTTP.Server | HTTPS.Server;
    private readonly _wsServer: WebSocketServer;

    protected emitter: (EventEmitter<LocalEvents> & EventEmitter<E>) = new EventEmitter();
    public readonly once: (EventEmitter<LocalEvents> & EventEmitter<E>)['once'] = this.emitter.once.bind(this.emitter);
    public readonly on: (EventEmitter<LocalEvents> & EventEmitter<E>)['on'] = this.emitter.on.bind(this.emitter);
    public readonly off: (EventEmitter<LocalEvents> & EventEmitter<E>)['off'] = this.emitter.off.bind(this.emitter);
    /**
     * @internal
     */
    public readonly _emit: (EventEmitter<LocalEvents> & EventEmitter<E>)['emit'] = this.emitter.emit.bind(this.emitter);

    public readonly clientCount: number = 0;
    public readonly clients: Record<string, Socket> = {};

    /**
     * This is the count of web socket request means invokes and transmit since the server is listening.
     * It is not the count of packages which will be greater.
     */
    public readonly wsRequestCount: number = 0;

    public connectionHandler: (socket: Socket) => Promise<any> | any = EMPTY_FUNCTION;

    /**
     * @description
     * Set this property to handle HTTP requests.
     * All HTTP requests (except health endpoint requests) will be answered
     * with 426 (Upgrade Required) when this property is undefined.
     * Notice that the health endpoint (when activated) is always reachable even if you set a httpRequestHandler.
     */
    public httpRequestHandler?: (req: HTTP.IncomingMessage, res: HTTP.ServerResponse) => Promise<any> | any;

    public healthCheck: () => Promise<boolean> | boolean = () => true;

    //Middlewares
    public handshakeMiddleware: HandshakeMiddleware | undefined;
    public socketMiddleware: SocketMiddleware | undefined;
    public authenticateMiddleware: AuthenticateMiddleware | undefined;
    public subscribeMiddleware: SubscribeMiddleware | undefined;
    public publishInMiddleware: PublishInMiddleware | undefined;
    public publishOutMiddleware: PublishOutMiddleware | undefined;

    /**
     * @internal
     * Internal access for the socket.
     */
    public readonly _internalBroker: InternalBroker;

    protected readonly internalBroker: InternalBroker;

    public exchange: Exchange;
    public refuseConnections: boolean = false;
    public ignoreFurtherTransmits: boolean = false;
    public ignoreFurtherInvokes: boolean = false;

    constructor(options: ServerOptions = {}) {
        Object.assign(this.options,options);
        this._options = this.options;

        this.options.path = this.options.path === "" || this.options.path === "/" ? "" :
            !this.options.path.startsWith("/") ? "/" + this.options.path : this.options.path;

        this.auth = new AuthEngine(this.options.auth);
        this.originsChecker = createOriginsChecker(this.options.origins);

        this.internalBroker = new InternalBroker(this);
        this._internalBroker = this.internalBroker;
        this.exchange = this.internalBroker.exchange;

        this._setUpSocketChLimit();
        this.httpServer = this._createHttpServer();
        this._wsServer = this._setUpWsServer();

    }

    private _setUpSocketChLimit() {
        if(this.options.socketChannelLimit != null) {
            const limit = this.options.socketChannelLimit;
            this._checkSocketChLimitReached = (count) => count >= limit;
        }
        else this._checkSocketChLimitReached = () => false;
    }

    private _setUpWsServer() {
        const wsServer = new WebSocketServer({
            server: this.httpServer,
            verifyClient: this._verifyClient.bind(this),
            path: this.options.path,
            ...(this.options.maxPayload != null ? {maxPayload: this.options.maxPayload} : {}),
            ...(this.options.perMessageDeflate != null ? {perMessageDeflate: this.options.perMessageDeflate} : {}),
        });
        wsServer.startAutoPing(this.options.pingInterval,true);
        this._authTokenExpireCheckerTicker = setInterval(() => {
            for(const id in this.clients) { // noinspection JSUnfilteredForInLoop
                this.clients[id]._checkAuthTokenExpire();
            }
        },this.options.auth.expireCheckInterval ?? 12000);
        wsServer.on('error',this._handleServerError.bind(this));
        wsServer.on('connection',this._handleSocketConnection.bind(this));
        return wsServer;
    }

    private _createHttpServer() {
        const httpOptions: Http.ServerOptions = this.options.maxHttpHeaderSize != null ?
            {maxHeaderSize: this.options.maxHttpHeaderSize} : {};
        const httpServer = this.options.tls != null ?
            HTTPS.createServer({...httpOptions,...this.options.tls}) :
            HTTP.createServer(httpOptions);

            if(this.options.healthEndpoint && req.path === '/health' && req.method === 'GET') {
        httpServer.on("request",async (req: HTTP.IncomingMessage, res: HTTP.ServerResponse) => {
                let healthy: boolean = false;
                try {healthy = await this.healthCheck()}
                catch (err) {this._emit('error', err)}
                res.writeHead(healthy ? 200 : 500, {'Content-Type': 'text/html'});
                res.end(healthy ? 'Healthy' : 'Unhealthy');
            }
            else if(this.httpRequestHandler) this.httpRequestHandler(req,res);
            else {
                const body = HTTP.STATUS_CODES[426];
                res.writeHead(426, {
                    'Content-Length': body?.length || 0,
                    'Content-Type': 'text/plain'
                });
                return res.end(body);
            }
        })
        httpServer.on('error', (err: Error): void => {
            this._emit("error",err);
        });
        return httpServer;
    }

    public async listen(): Promise<void> {
        if(!this.httpServer.listening) return new Promise((res, rej) => {
            const port = this.options.port;
            const portErrorListener = (err) => {
                if(err.code === 'EADDRINUSE') rej(new PortInUseError(port));
            };
            this.httpServer.once("error", portErrorListener);
            this.httpServer.listen(port,() => {
                this.httpServer.off("error",portErrorListener);
                res();
            });
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
            const res = [this.options.pingInterval,authTokenState];
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

    getInternalSubscriptions(): string[] {
        return this.internalBroker.getSubscriptionList();
    }

    resetWsRequestCount()  {
        (this as Writable<Server>).wsRequestCount = 0;
    }

    /**
     * Terminates the server.
     * After termination, you should not use this instance anymore
     * or anything else from the server.
     * [Use this method only when you know what you do.]
     */
    terminate() {
        this._wsServer.close();
        this.httpServer.close();
        Object.values(this.clients).forEach(client => client._terminate());
        (this as Writable<Server>).clients = {};
        (this as Writable<Server>).clientCount = 0;
        this.internalBroker.terminate();
    }
}