/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import ServerOptions, {CompressionOptions, Compressor, TLSOptions} from "./lib/ServerOptions";
import Socket, {
    ProcedureListener, ProcedureEnd,
    ProcedureReject, ReceiverListener,
    ReservedSocketProcedures, ReservedSocketReceivers
} from "./lib/Socket";
import {HttpRequest}             from "ziron-ws";
import {HttpResponse}            from "./lib/http/EnhanceHttpResponse";
import Server                    from "./lib/Server";
import AuthEngine                from "./lib/AuthEngine";
import ChannelExchange           from "./lib/ChannelExchange";
import {ExternalBrokerClient}    from "./lib/broker/ExternalBrokerClient";
import EventEmitter              from "emitix";
import {Block}                   from "./lib/MiddlewareUtils";
import {TimeoutError, Transport} from "ziron-engine";
import InternalBroker            from "./lib/broker/InternalBroker";
import {FailedToListenError}     from "./lib/FailedToListenError";
import UpgradeRequest            from "./lib/http/UpgradeRequest";
import StaticFilesRouter         from "./lib/http/StaticFilesRouter";
import {AuthTokenExpiredError, AuthTokenInvalidError, AuthTokenError, AuthTokenNotBeforeError} from "ziron-errors";

EventEmitter.onceTimeoutErrorCreator = () => new TimeoutError('Once timeout reached.','OnceListener');
const prepareMultiTransmit = Transport.prepareMultiTransmit;

export * from 'ziron-engine';
export {
    Server,
    FailedToListenError,
    ServerOptions,
    CompressionOptions,
    Compressor,
    TLSOptions,
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
    ReservedSocketProcedures,
    ReservedSocketReceivers,
    AuthTokenExpiredError,
    AuthTokenInvalidError,
    AuthTokenError,
    AuthTokenNotBeforeError,
    UpgradeRequest,
    HttpRequest,
    HttpResponse,
    StaticFilesRouter
}