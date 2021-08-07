/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {DataType} from "ziron-engine";
import {EMPTY_FUNCTION} from "../Constants";

export interface ExternalBrokerClient {
    subscribe(channel: string),
    unsubscribe(channel: string),
    publish(channel: string, data: any, processComplexTypes: boolean),
    onPublish: (channel: string, data: any, dataType: DataType) => void
}

export const defaultExternalBrokerClient: ExternalBrokerClient = {
    publish: EMPTY_FUNCTION,
    subscribe: EMPTY_FUNCTION,
    unsubscribe: EMPTY_FUNCTION
};