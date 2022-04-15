/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {DataType} from "ziron-engine";
import {InternalServerReceivers} from "ziron-events";
import Socket from "./Socket";

export type Receiver = (data: any, type: DataType) => void | Promise<void>;
export type StandaloneReceiver = (socket: Socket, data: any, type: DataType) => void | Promise<void>;

export type Receivers<R extends string = never> =
    {readonly [key in InternalServerReceivers]: Receiver} &
    {readonly [key in R]: never} & {[key: string]: Receiver | undefined};
export type StandaloneReceivers<R extends string = never> =
    { readonly [key in InternalServerReceivers]: never } &
    {readonly [key in R]: never} & Record<string,StandaloneReceiver>;

export function applyStandaloneReceivers(socket: Socket, receivers: StandaloneReceivers) {
    for(const name in receivers) {
        if(!receivers.hasOwnProperty(name)) continue;
        const receiver = receivers[name];
        socket.receivers[name] = (data,type) => receiver(socket,data,type);
    }
}