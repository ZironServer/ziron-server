/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Server                    from "./lib/Server";
import ServerOptions, {Compressor} from "./lib/ServerOptions";
import Socket, {ProcedureListener, ProcedureEnd,
    ProcedureReject, ReceiverListener} from "./lib/Socket";
import AuthEngine                from "./lib/AuthEngine";
import ChannelExchange           from "./lib/ChannelExchange";
import {ExternalBrokerClient}    from "./lib/broker/ExternalBrokerClient";
import EventEmitter              from "emitix";
import {Block}                   from "./lib/MiddlewareUtils";
import {TimeoutError, Transport} from "ziron-engine";
import InternalBroker            from "./lib/broker/InternalBroker";
import {FailedToListenError}     from "./lib/FailedToListenError";
import {AuthTokenExpiredError, AuthTokenInvalidError, AuthTokenError, AuthTokenNotBeforeError}   from "ziron-errors";
import { serveDir as staticFiles } from 'uwebsocket-serve';
import {Http} from "./lib/Http";

EventEmitter.onceTimeoutErrorCreator = () => new TimeoutError('Once timeout reached.','OnceListener');
const prepareMultiTransmit = Transport.prepareMultiTransmit;

export * from 'ziron-engine';
export {
    Server,
    FailedToListenError,
    ServerOptions,
    Compressor,
    Socket,
    AuthEngine,
    ChannelExchange,
    ExternalBrokerClient,
    InternalBroker,
    prepareMultiTransmit,
    Block,
    ProcedureListener,
    ProcedureEnd,
    ProcedureReject,
    ReceiverListener,
    AuthTokenExpiredError,
    AuthTokenInvalidError,
    AuthTokenError,
    AuthTokenNotBeforeError,
    staticFiles,
    Http
}