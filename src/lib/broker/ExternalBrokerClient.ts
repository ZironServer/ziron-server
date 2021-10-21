/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {EMPTY_FUNCTION} from "../Constants";

export interface ExternalBrokerClient {
    subscribe(channel: string): void,
    unsubscribe(channel: string): void,
    publish(channel: string, data: any, processComplexTypes: boolean): void,
    terminate(): void
}

export const defaultExternalBrokerClient: ExternalBrokerClient = {
    publish: EMPTY_FUNCTION,
    subscribe: EMPTY_FUNCTION,
    unsubscribe: EMPTY_FUNCTION,
    terminate: EMPTY_FUNCTION
};