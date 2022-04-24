/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import ServerOptions, {CompressionOptions, Compressor, COMPRESSOR_TO_INTERNAL_COMPRESSOR} from "./ServerOptions";
import {createOriginsChecker, OriginsChecker} from "./OriginsChecker";
import AuthEngine from "./AuthEngine";
import Socket from "./Socket";
import {
    App,
    DISABLED,
    HttpRequest,
    HttpResponse as RawHttpResponse,
    SSLApp,
    TemplatedApp,
    us_listen_socket,
    us_listen_socket_close,
    us_socket_context_t,
    WebSocket
} from 'ziron-ws';
import EventEmitter from "emitix";
import {ServerProtocolError} from "ziron-errors";
import {preprocessPath, Writable} from "./Utils";
import {InternalServerTransmits} from "ziron-events";
import {Block} from "./MiddlewareUtils";
import ChannelExchange from "./ChannelExchange";
import InternalBroker from "./broker/InternalBroker";
import * as uniqId from "uniqid";
import {EMPTY_FUNCTION} from "./Constants";
import {FailedToListenError} from "./FailedToListenError";
import enhanceHttpResponse, {HttpResponse} from "./http/EnhanceHttpResponse";
import UpgradeRequest from "./http/UpgradeRequest";
import {
    BatchOption,
    ComplexTypesOption,
    DynamicGroupTransport,
    PING,
    sendPackage,
    Transport,
    TransportOptions
} from "ziron-engine";
import {SkipGroupMemberOption} from "./Options";

type LocalEvents<S extends Socket> = {
    'error': [Error],
    'warning': [Error],
    'badSocketAuthToken': [S,Error,string],
    'disconnection': [S,number,any],
};

type UpgradeMiddleware = (req: UpgradeRequest) => Promise<void> | void;
type SocketMiddleware<S extends Socket> = (socket: S) => Promise<void> | void;
type AuthenticateMiddleware<S extends Socket> = (socket: S, authToken: object, signedAuthToken: string) => Promise<void> | void;
type SubscribeMiddleware<S extends Socket> = (socket: S, channel: string) => Promise<void> | void;
type PublishInMiddleware<S extends Socket> = (socket: S, channel: string, data: any) => Promise<void> | void;

/**
 * @description
 * The Ziron server.
 * Mostly everything is related to web socket protocol on the server instance.
 * But an HTTP/HTTPS server is created to catch upgrade requests and to create a health endpoint.
 * All other HTTP requests will be answered with 426 (Upgrade Required),
 * but it is possible to provide a custom HTTP request handler.
 */
export default class Server<E extends { [key: string]: any[]; } = {},ES extends Socket = Socket> {

    /**
     * @internal
     * Internal access for the socket.
     */
    readonly options: Required<ServerOptions> = {
        id: uniqId(),
        maxPayloadSize: 4194304,
        maxBackpressure: 6291456,
        socketChannelLimit: 1000,
        allowClientPublish: true,
        publishToPublisher: true,
        responseTimeout: 7000,
        pingInterval: 8000,
        origins: null,
        port: 3000,
        path: '/',
        auth: {},
        compression: {},
        healthEndpoint: true,
        tls: null,
        binaryContentPacketTimeout: 10000,
        streamsPerPackageLimit: 20,
        chunksCanContainStreams: false
    };

    private readonly _compressionOptions: Required<CompressionOptions> = {
        active: true,
        compressor: Compressor.DedicatedCompressor4KB,
        alwaysCompressBatches: false,
        minBytes: 104857,
        minLength: 20000,
    }

    /**
     * @internal
     * Internal access for the socket.
     */
    readonly transportOptions: TransportOptions;

    /**
     * @internal
     * Internal access for the socket.
     */
    readonly lowSendBackpressureMark: number;

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

    get tlsActive(): boolean {
        return this.options.tls != null;
    }

    private _authTokenExpireCheckerTicker: NodeJS.Timeout;
    private _pingTicker: NodeJS.Timeout;

    /**
     * @internal
     */
    readonly _app: TemplatedApp;
    private _listenToken?: us_listen_socket | null;
    private _startListenPromise?: Promise<void> | null;
    private readonly _groupTransport: DynamicGroupTransport;

    protected emitter: (EventEmitter<LocalEvents<ES>> & EventEmitter<E>) = new EventEmitter();
    public readonly once: (EventEmitter<LocalEvents<ES>> & EventEmitter<E>)['once'] = this.emitter.once.bind(this.emitter);
    public readonly on: (EventEmitter<LocalEvents<ES>> & EventEmitter<E>)['on'] = this.emitter.on.bind(this.emitter);
    public readonly off: (EventEmitter<LocalEvents<ES>> & EventEmitter<E>)['off'] = this.emitter.off.bind(this.emitter);
    /**
     * @internal
     */
    public readonly _emit: (EventEmitter<LocalEvents<ES>> & EventEmitter<E>)['emit'] = this.emitter.emit.bind(this.emitter);

    /**
     * @description
     * The connected web socket clients count.
     */
    public readonly clientCount: number = 0;
    /**
     * @description
     * The connected web socket clients.
     */
    public readonly clients: Record<string, ES> = {};

    /**
     * @description
     * This is a counter of WebSocket messages.
     * You can reset this counter with the resetWsMessageCount method.
     */
    public readonly wsMessageCount: number = 0;

    /**
     * @description
     * This is a counter of received invoke messages.
     * You can reset this counter with the resetInvokeMessageCount method.
     */
    public readonly invokeMessageCount: number = 0;

    /**
     * @description
     * This is a counter of received transmit messages.
     * You can reset this counter with the resetTransmitMessageCount method.
     */
    public readonly transmitMessageCount: number = 0;

    /**
     * @description
     * This is a counter of HTTP messages.
     * You can reset this counter with the resetHttpMessageCount method.
     */
    public readonly httpMessageCount: number = 0;

    /**
     * @description
     * Specify a socket constructor extension.
     * This extension will be called in the socket constructor and
     * can be used to add properties to the Socket instance.
     * Use this extension only when you know what you are doing.
     * It is also recommended specifying this new Socket type at the
     * generic ES (extended socket) parameter of the Server class.
     * This approach is implemented rather than a custom Socket class to prevent
     * a larger proto chain and for the ability to add external variables into the constructor easily.
     */
    public socketConstructorExtension: (socket: Socket) => void = EMPTY_FUNCTION;

    /**
     * @description
     * The connection handler will be called when a new socket is connected.
     * The handler can be used to register receivers or procedures on the socket.
     * The returned value will be transmitted to the client.
     * Promises are considered, and the connection is only ready when the promise is resolved.
     */
    public connectionHandler: (socket: ES) => Promise<any> | any = EMPTY_FUNCTION;

    /**
     * @description
     * Set this property to handle HTTP requests.
     * All HTTP requests (except health endpoint requests) will be answered
     * with 426 (Upgrade Required) when this property is undefined.
     * Notice that the health endpoint (when activated) is always reachable even if you set a httpRequestHandler.
     * @param path
     * The requested path (always includes a prefix slash).
     */
    public httpRequestHandler?: (path: string,req: HttpRequest,res: HttpResponse) => Promise<any> | any;

    /**
     * @description
     * Specify a custom health check.
     * This health check is used to process the value for the health endpoint.
     * This endpoint could be used for docker health checks.
     */
    public healthCheck: () => Promise<boolean> | boolean = () => true;

    //Middlewares
    public upgradeMiddleware: UpgradeMiddleware | undefined;
    public socketMiddleware: SocketMiddleware<ES> | undefined;
    public authenticateMiddleware: AuthenticateMiddleware<ES> | undefined;
    public subscribeMiddleware: SubscribeMiddleware<ES> | undefined;
    public publishInMiddleware: PublishInMiddleware<ES> | undefined;

    /**
     * @internal
     * Internal access for the socket.
     */
    public readonly _internalBroker: InternalBroker;

    protected readonly internalBroker: InternalBroker;

    public readonly channels: ChannelExchange;
    /**
     * @description
     * Boolean that indicates if the server should reject web socket handshakes.
     */
    public refuseConnections: boolean = false;
    public ignoreFurtherTransmits: boolean = false;
    public ignoreFurtherInvokes: boolean = false;

    constructor(options: ServerOptions = {}) {
        Object.assign(this.options,options);
        this.options.path = preprocessPath(this.options.path);
        Object.assign(this._compressionOptions,options.compression);
        this.transportOptions = this._createTransportOptions();
        this.lowSendBackpressureMark = Math.trunc(0.5 * this.options.maxBackpressure);

        this._loadCompressionOptions();
        this.auth = new AuthEngine(this.options.auth);
        this.originsChecker = createOriginsChecker(this.options.origins);

        this.internalBroker = new InternalBroker(this);
        this._internalBroker = this.internalBroker;
        this.channels = this.internalBroker.exchange;

        this._setUpSocketChLimit();
        this._app = this._setUpApp();
        this._groupTransport = this._createGroupTransport();
        this._startPingInterval();
        this._startAuthExpireCheck();
        this._setupHttpRequestHandling();
    }

    private _createGroupTransport() {
        return new DynamicGroupTransport({
            send: (group, msg, binary, batch) => {
                this._app.publish("G"+group,msg,binary,this._shouldCompress(msg,binary,batch));
            },
            isConnected: () => true
        },DynamicGroupTransport.buildOptions({
            freeBufferMaxPoolSize: 200,
            ...this.transportOptions
        }));
    }

    private _createTransportOptions(): TransportOptions {
        return Transport.buildOptions({
            maxBufferSize: Math.trunc(0.7 * this.options.maxBackpressure),
            limitBatchBinarySize: Math.max(Math.ceil(0.7 * this.options.maxPayloadSize),200),
            limitBatchStringLength: Math.max(Math.ceil(0.7 * (this.options.maxPayloadSize / 4)),2000),
            responseTimeout: this.options.responseTimeout,
            binaryContentPacketTimeout: this.options.binaryContentPacketTimeout,
            streamsPerPackageLimit: this.options.streamsPerPackageLimit,
            chunksCanContainStreams: this.options.chunksCanContainStreams,
            streamsEnabled: true
        });
    }

    /**
     * @internal
     */
    public readonly _shouldCompress: (msg?: ArrayBuffer | string,binary?: boolean,batch?: boolean) => boolean = () => false;

    private _loadCompressionOptions() {
        if(!this._compressionOptions.active) return;
        const minBytes = this._compressionOptions.minBytes;
        const minLength = this._compressionOptions.minLength;
        (this as Writable<Server<any,any>>)._shouldCompress = this._compressionOptions.alwaysCompressBatches ?
            (msg?: any,binary?: boolean,batch?: boolean) =>
                batch || (binary ? (msg as ArrayBuffer).byteLength >= minBytes : (msg as string).length >= minLength) :
            (msg?: any,binary?: boolean) =>
                binary ? (msg as ArrayBuffer).byteLength >= minBytes : (msg as string).length >= minLength;
    }

    private _setUpSocketChLimit() {
        if(this.options.socketChannelLimit != null) {
            const limit = this.options.socketChannelLimit;
            this._checkSocketChLimitReached = (count) => count >= limit;
        }
        else this._checkSocketChLimitReached = () => false;
    }

    private _setUpApp(): TemplatedApp {
        const tls = this.options.tls;
        return (tls ? SSLApp({
            key_file_name: tls.keyFile,
            cert_file_name: tls.certFile,
            passphrase: tls.passphrase,
            dh_params_file_name: tls.dhParamsFile,
            ssl_prefer_low_memory_usage: tls.releaseBuffersMode
        }) : App()).ws("/*",{
            compression: this._compressionOptions.active ?
                COMPRESSOR_TO_INTERNAL_COMPRESSOR[this._compressionOptions.compressor] : DISABLED,
            maxPayloadLength: this.options.maxPayloadSize,
            maxBackpressure: this.options.maxBackpressure,
            ...({
                closeOnBackpressureLimit: 1
            } as any),
            idleTimeout: this.options.pingInterval * 2,
            upgrade: this._handleUpgrade.bind(this),
            open: this._handleWsOpen.bind(this),
            message: this._handleWsMessage.bind(this),
            drain: Server._handleWsDrain,
            close: Server._handleWsClose,
            sendPingsAutomatically: 0
        });
    }

    private _startPingInterval() {
        this._pingTicker = setInterval(() => {
            this._app.publish('broadcast',PING,true);
        },this.options.pingInterval);
    }

    private _startAuthExpireCheck() {
        this._authTokenExpireCheckerTicker = setInterval(() => {
            for(const id in this.clients) { // noinspection JSUnfilteredForInLoop
                this.clients[id]._checkAuthTokenExpire();
            }
        },this.options.auth.expireCheckInterval ?? 12000);
    }

    private static _abortUpgrade(res: RawHttpResponse, code: number, message: string): void {
        res.end(`HTTP/1.1 ${code} ${message}\r\n\r\n`,true);
    }

    private _handleUpgrade(res: RawHttpResponse,req: HttpRequest,context: us_socket_context_t) {
        (this as Writable<Server<E,ES>>).httpMessageCount++;

        if(this.refuseConnections) return Server._abortUpgrade(res,403,'Client verification failed');

        let resAborted = false;
        res.onAborted(() => resAborted = true);

        const reqPath = req.getUrl().split('?')[0].split('#')[0];
        if(reqPath !== this.options.path && reqPath !== this.options.path + '/')
            return Server._abortUpgrade(res,400, 'URL not supported');

        const origin = req.getHeader("origin");
        if(!this.originsChecker(origin)) {
            const err = new ServerProtocolError('Failed to authorize socket handshake - Invalid origin: ' + origin);
            this._emit('warning', err);
            return Server._abortUpgrade(res,403,err.message);
        }

        const upgradeRequest = new UpgradeRequest(req);

        if(upgradeRequest.headers.secWebSocketProtocol !== 'ziron')
            return Server._abortUpgrade(res,4800,'Unsupported protocol');

        const {
            secWebSocketKey,
            secWebSocketProtocol,
            secWebSocketExtensions
        } = upgradeRequest.headers;

        if(this.upgradeMiddleware){
            (async () => {
                try {
                    await this.upgradeMiddleware!(upgradeRequest);
                    if(!resAborted) res.upgrade({req: upgradeRequest}, secWebSocketKey,
                        secWebSocketProtocol, secWebSocketExtensions, context);
                }
                catch (err) {
                    if(err instanceof Block) {
                        if(!resAborted) Server._abortUpgrade(res, err.code, err.message || 'Handshake was blocked by handshake middleware');
                    }
                    else {
                        this._emit('error', err);
                        if(!resAborted) Server._abortUpgrade(res, err.code ?? 403,
                            'Handshake was blocked by handshake middleware');
                    }
                }
            })();
        }
        else res.upgrade({req: upgradeRequest}, secWebSocketKey,
            secWebSocketProtocol, secWebSocketExtensions, context);
    }

    private async _handleWsOpen(ws: WebSocket) {

        let zSocket: Socket;
        //Socket constructor extension is used in the constructor.
        //On error, the socket will never be created and connected correctly.
        try {zSocket = new Socket(this,ws);}
        catch (err) {return ws.end(1011,'Unknown connection error');}

        ws.zSocket = zSocket;
        ws.subscribe("broadcast");

        (this as Writable<Server<E,ES>>).clientCount++;
        this.clients[zSocket.id] = zSocket as ES;

        try {
            const signedToken = zSocket.upgradeRequest.signedToken;

            if(this.socketMiddleware){
                try {await this.socketMiddleware(zSocket as ES);}
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

            let authTokenState = -1;
            if(signedToken) {
                try {
                    await zSocket._processAuthToken(signedToken);
                    authTokenState = 0;
                }
                catch (err) {authTokenState = (err && err.badAuthToken) ? 2 : 1;}
            }

            const readyData = await this.connectionHandler(zSocket as ES);
            const res = [this.options.pingInterval,this.options.maxPayloadSize,authTokenState];
            if(readyData !== undefined) res.push(readyData);
            zSocket.transmit(InternalServerTransmits.ConnectionReady,res);
        }
        catch (err) {
            this._emit('error', err);
            zSocket.disconnect(err.code ?? 1011,'Unknown connection error');
        }
    }

    private _handleWsMessage(ws: WebSocket, message: ArrayBuffer, isBinary: boolean) {
        (this as Writable<Server<E,ES>>).wsMessageCount++;
        const zSocket: Socket = ws.zSocket;
        if(zSocket) zSocket._emitMessage(isBinary ? message : Buffer.from(message).toString());
    }

    private static _handleWsDrain(ws: WebSocket) {
        const zSocket: Socket = ws.zSocket;
        if(zSocket) zSocket._emitDrain();
    }

    private static _handleWsClose(ws: WebSocket, code: number, message: ArrayBuffer) {
        const zSocket: Socket = ws.zSocket;
        if(zSocket) zSocket._emitClose(code,Buffer.from(message).toString());
    }

    private _setupHttpRequestHandling() {
        const healthPath = `${this.options.path}/health`;

        this._app.any("/*",(rawRes,req) => {
            (this as Writable<Server<E,ES>>).httpMessageCount++;

            const res = enhanceHttpResponse(rawRes);

            const origin = req.getHeader("origin");
            if(this.originsChecker(origin)){
                res.headers['Access-Control-Allow-Origin'] = origin;
                res.headers['Access-Control-Allow-Methods'] = '*';
                res.headers['Access-Control-Allow-Headers'] = 'X-Requested-With,contenttype';
                res.headers['Access-Control-Allow-Credentials'] = 'true';
            }
            else return res.cork(() => {
                res.writeStatus("401 Unauthorized");
                res.headers['Content-Type'] = 'text/plain';
                res.writeHeaders();
                res.end('Failed - Invalid origin: ' + origin);
            });

            const path = req.getUrl().split('?')[0].split('#')[0];

            if(this.options.healthEndpoint && req.getMethod() === 'get' && path === healthPath)
                return this._processHttpHealthCheckRequest(res);
            else if(this.httpRequestHandler) this.httpRequestHandler(path,req,res);
            else res.cork(() => {
                res.writeStatus('426 Upgrade Required');
                res.end();
            })
        })
    }

    private async _processHttpHealthCheckRequest(res: HttpResponse) {
        let healthy: boolean = false;
        try {healthy = await this.healthCheck()}
        catch (err) {this._emit('error', err)}

        if (res.aborted) return;
        res.cork(() => {
            res.writeStatus(healthy ? "200 OK" : "500 Internal Server Error");
            res.headers['Content-Type'] = 'text/html';
            res.writeHeaders();
            res.end(healthy ? 'Healthy' : 'Unhealthy');
        });
    }

    /**
     * @description
     * Sends a transmit to a group.
     * Instead of channels, groups can only be accessed and controlled from the server-side and
     * messages are not shared across multiple server instances.
     * Groups don't have their own special protocol and can be used to send a standard
     * transmit optimized to multiple sockets of a group.
     * Additionally, the group transmits support batching when not using the skipMember option.
     * When using the skipMember option, the batch option will be ignored.
     * Internally prepareMultiTransmit is used to create the transmit packet,
     * so binary data is supported.
     * @param group
     * @param receiver
     * @param data
     * @param options
     */
    public transmitToGroup(group: string, receiver: string, data?: any, options?: ComplexTypesOption & BatchOption & SkipGroupMemberOption) {
        const skipMember = options?.skipMember;
        if(skipMember) sendPackage(Transport.prepareMultiTransmit(receiver,data,options),
            (msg, binary, batch) => {
                skipMember._socket.publish("G"+group,msg,binary,this._shouldCompress(msg,binary,batch));
        });
        else this._groupTransport.transmit(group,receiver,data,options);
    }

    /**
     * @description
     * Returns the member count of a specific group from this server instance.
     * Instead of channels, groups can only be accessed and controlled from the server-side and
     * messages are not shared across multiple server instances.
     * Groups don't have their own special protocol and can be used to send a standard
     * transmit optimized to multiple sockets of a group.
     * Additionally, the group transmits support batching when not using the skipMember option.
     * Internally prepareMultiTransmit is used to create the transmit packet,
     * so binary data is supported.
     * @param group
     */
    public getGroupMemberCount(group: string): number {
       return this._app.numSubscribers("G"+group);
    }

    public async listen(): Promise<void> {
        if(this._listenToken != null) return Promise.resolve();
        if(!this._startListenPromise)
            return this._startListenPromise = new Promise<void>((res, rej) => {
                const port = this.options.port;
                this._app.listen(port,1,(token) => {
                    if(token) {
                        this._listenToken = token;
                        res();
                    }
                    else rej(new FailedToListenError(port));
                    this._startListenPromise = null;
                });
            });
    }

    /**
     * @internal
     * @param socket
     * @private
     */
    _removeSocket(socket: Socket) {
        (this as Writable<Server<E,ES>>).clientCount--;
        delete this.clients[socket.id];
    }

    /**
     * @internal
     * @param count
     * @private
     */
    _checkSocketChLimitReached: (count: number) => boolean;

    getInternalSubscriptions(): string[] {
        return this.internalBroker.getSubscriptions();
    }

    resetWsMessageCount()  {(this as Writable<Server<E,ES>>).wsMessageCount = 0;}
    resetInvokeMessageCount()  {(this as Writable<Server<E,ES>>).invokeMessageCount = 0;}
    resetTransmitMessageCount()  {(this as Writable<Server<E,ES>>).transmitMessageCount = 0;}
    resetHttpMessageCount()  {(this as Writable<Server<E,ES>>).httpMessageCount = 0;}

    /**
     * @description
     * Resets all counts (wsMessageCount,invokeMessageCount,transmitMessageCount and httpMessageCount).
     */
    resetCounts() {
        (this as Writable<Server<E,ES>>).wsMessageCount = 0;
        (this as Writable<Server<E,ES>>).invokeMessageCount = 0;
        (this as Writable<Server<E,ES>>).transmitMessageCount = 0;
        (this as Writable<Server<E,ES>>).httpMessageCount = 0;
    }

    stopListen() {
        if(this._listenToken) {
            us_listen_socket_close(this._listenToken);
            this._listenToken = null;
        }
    }

    /**
     * Terminates the server.
     * After termination, you should not use this instance anymore
     * or anything else from the server.
     * [Use this method only when you know what you do.]
     */
    terminate() {
        this.stopListen();
        Object.values(this.clients).forEach(client => client._terminate());
        (this as Writable<Server<E,ES>>).clients = {};
        (this as Writable<Server<E,ES>>).clientCount = 0;
        this.internalBroker.terminate();
    }
}