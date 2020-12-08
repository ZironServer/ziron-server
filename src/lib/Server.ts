/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import ServerOptions from "./ServerOptions";
import {createOriginsChecker, OriginsChecker} from "./OriginsChecker";
import AuthEngine from "./AuthEngine";
import {ConnectionInfo, VerifyClientNext, WebSocketServer, WebSocket} from 'z-uws';
import * as HTTP from "http";
import * as HTTPS from "https";
import EventEmitter from "emitix";
import {ServerProtocolError} from "zation-core-errors";
import {Writable} from "./Utils";

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
type ClientPublishMiddleware = (socket: Socket, channel: string, data: any) => Promise<void> | void;
type PublishOutMiddleware = (socket: Socket, channel: string, data: any) => Promise<void> | void;

export default class Server {
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



    //Middlewares
    public handshakeMiddleware: HandshakeMiddleware | undefined;
    public socketMiddleware: SocketMiddleware | undefined;
    public authenticateMiddleware: AuthenticateMiddleware | undefined;
    public subscribeMiddleware: SubscribeMiddleware | undefined;
    public clientPublishMiddleware: ClientPublishMiddleware | undefined;
    public publishOutMiddleware: PublishOutMiddleware | undefined;


    constructor(options: ServerOptions = {}) {
        this.auth = new AuthEngine(this._options.auth);
        this.originsChecker = createOriginsChecker(this._options.origins);
    }

    public listen: (port?: number, onListen?: () => void) => void = this._create.bind(this);
    public attach: (httpServer: HTTP.Server | HTTPS.Server) => void = this._create.bind(this);

    private _create(port?: number, onListen?: () => void)
    private _create(httpServer: HTTP.Server | HTTPS.Server)
    private _create(http: HTTP.Server | HTTPS.Server | number = 3000, onListen?: () => void) {
        if(this._wsServer) throw new Error('The websocket server is already created.')
        this._wsServer = new WebSocketServer({
            ...(typeof http === 'number' ? {port: http} : {server: http}),
            verifyClient: this._verifyClient.bind(this),
            path: this._options.path,
            ...(this._options.maxPayload != null ? {maxPayload: this._options.maxPayload} : {}),
            ...(this._options.perMessageDeflate != null ? {perMessageDeflate: this._options.perMessageDeflate} : {}),
        },onListen);

        this._wsServer.startAutoPing(this._options.pingInterval,true);

        this._wsServer.on('error',this._handleServerError.bind(this));
        this._wsServer.on('connection',this._handleSocketConnection.bind(this));
    }

}