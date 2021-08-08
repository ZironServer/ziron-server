/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import Server                    from "./lib/Server";
import ServerOptions             from "./lib/ServerOptions";
import Socket, {ProcedureListener, ReceiverListener} from "./lib/Socket";
import AuthEngine                from "./lib/AuthEngine";
import Exchange                  from "./lib/Exchange";
import {ExternalBrokerClient}    from "./lib/broker/ExternalBrokerClient";
import EventEmitter              from "emitix";
import {Block}                   from "./lib/MiddlewareUtils";
import {TimeoutError, Transport} from "ziron-engine";

EventEmitter.onceTimeoutErrorCreator = () => new TimeoutError('Once timeout reached.','OnceListener');
const prepareMultiTransmit = Transport.prepareMultiTransmit;

export * from 'ziron-engine';
export {
    Server,
    ServerOptions,
    Socket,
    AuthEngine,
    Exchange,
    ExternalBrokerClient,
    prepareMultiTransmit,
    Block,
    ProcedureListener,
    ReceiverListener
}