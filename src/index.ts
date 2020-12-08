/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import Server                    from "./lib/Server";
import ServerOptions             from "./lib/ServerOptions";
import Socket                    from "./lib/Socket";
import AuthEngine                from "./lib/AuthEngine";
import Exchange                  from "./lib/Exchange";
import {ExternalBrokerClient}    from "./lib/ExternalBrokerClient";
import EventEmitter              from "emitix";
import {BackError, TimeoutError, Transport} from "ziron-engine";

EventEmitter.onceTimeoutErrorCreator = () => new TimeoutError('Once timeout reached.','OnceListener');
const prepareMultiTransmit = Transport.prepareMultiTransmit;

export {
    Server,
    ServerOptions,
    Socket,
    AuthEngine,
    Exchange,
    ExternalBrokerClient,
    BackError,
    prepareMultiTransmit
}