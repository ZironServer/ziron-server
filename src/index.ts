/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import ServerOptions, {CompressionOptions, Compressor, TLSOptions} from "./lib/ServerOptions";
import { Procedure, ProcedureEnd, ProcedureReject, StandaloneProcedure, applyStandaloneProcedures } from "./lib/Procedure";
import { Receiver, StandaloneReceiver, applyStandaloneReceivers } from "./lib/Receiver";
import Socket                    from "./lib/Socket";
import {HttpRequest}             from "./lib/http/EnhanceHttpRequest";
import {HttpResponse, HttpResponseState} from "./lib/http/EnhanceHttpResponse";
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
    Procedure,
    ProcedureEnd,
    ProcedureReject,
    StandaloneProcedure,
    applyStandaloneProcedures,
    Receiver,
    StandaloneReceiver,
    applyStandaloneReceivers,
    AuthTokenExpiredError,
    AuthTokenInvalidError,
    AuthTokenError,
    AuthTokenNotBeforeError,
    UpgradeRequest,
    HttpRequest,
    HttpResponse,
    HttpResponseState,
    StaticFilesRouter
}