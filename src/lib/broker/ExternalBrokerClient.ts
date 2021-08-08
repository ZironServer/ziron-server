/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {EMPTY_FUNCTION} from "../Constants";

export interface ExternalBrokerClient {
    subscribe(channel: string): void,
    unsubscribe(channel: string): void,
    publish(channel: string, data: any, processComplexTypes: boolean): void,
}

export const defaultExternalBrokerClient: ExternalBrokerClient = {
    publish: EMPTY_FUNCTION,
    subscribe: EMPTY_FUNCTION,
    unsubscribe: EMPTY_FUNCTION
};