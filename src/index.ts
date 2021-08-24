/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import Server                    from "./lib/Server";
import ServerOptions             from "./lib/ServerOptions";
import Socket, {ProcedureListener, ProcedureEnd,
    ProcedureReject, ReceiverListener} from "./lib/Socket";
import AuthEngine                from "./lib/AuthEngine";
import Exchange                  from "./lib/Exchange";
import {ExternalBrokerClient}    from "./lib/broker/ExternalBrokerClient";
import EventEmitter              from "emitix";
import {Block}                   from "./lib/MiddlewareUtils";
import {TimeoutError, Transport} from "ziron-engine";
import InternalBroker            from "./lib/broker/InternalBroker";
import {PortInUseError}          from "./lib/PortInUseError";
import {AuthTokenExpiredError, AuthTokenInvalidError, AuthTokenError, AuthTokenNotBeforeError}   from "ziron-errors";

EventEmitter.onceTimeoutErrorCreator = () => new TimeoutError('Once timeout reached.','OnceListener');
const prepareMultiTransmit = Transport.prepareMultiTransmit;

export * from 'ziron-engine';
export {
    Server,
    PortInUseError,
    ServerOptions,
    Socket,
    AuthEngine,
    Exchange,
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
    AuthTokenNotBeforeError
}