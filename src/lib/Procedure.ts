/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {DataType} from "ziron-engine";
import Socket from "./Socket";
import {InternalServerProcedures} from "ziron-events";

export type ProcedureEnd = (data?: any, processComplexTypes?: boolean) => void;
export type ProcedureReject = (err?: any) => void;

export type Procedure = (data: any,end: ProcedureEnd, reject: ProcedureReject,
                                 type: DataType) => void | Promise<void>;
export type StandaloneProcedure = (socket: Socket, data: any,end: ProcedureEnd, reject: ProcedureReject,
                                           type: DataType) => void | Promise<void>;

export type Procedures<R extends string = never> =
    {readonly [key in InternalServerProcedures]: Procedure} &
    {readonly [key in R]: never} & {[key: string]: Procedure | undefined};
export type StandaloneProcedures<R extends string = never> =
    { readonly [key in InternalServerProcedures]?: never } &
    {readonly [key in R]?: never} & Record<string,StandaloneProcedure>;

export function applyStandaloneProcedures(socket: Socket, procedures: StandaloneProcedures) {
    for(const name in procedures) {
        if(!procedures.hasOwnProperty(name)) continue;
        const procedure = procedures[name];
        if(!procedure) continue;
        socket.procedures[name] = (data,end,reject,type) =>
            procedure(socket,data,end,reject,type);
    }
}