/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import * as Http from "http";

export type Writable<T> = { -readonly [P in keyof T]: T[P] };

export const distinctArrayFilter = <T>(v: T, i: number, a: T[]) => a.indexOf(v) === i;

export function tryGetClientIpFromHeaders(req: Http.IncomingMessage): string | undefined {
    const xForwarded = req.headers['x-forwarded-for'];
    if(typeof xForwarded === 'string') return xForwarded.split(',')[0].trim();
    return undefined;
}

export function tryGetClientPortFromHeaders(req: Http.IncomingMessage): number | undefined {
    const xForwarded = req.headers['x-forwarded-port'];
    if(typeof xForwarded === 'string') return parseInt(xForwarded.split(',')[0].trim())
        || undefined;
    return undefined;
}

export function preprocessPath(path: string): string {
    // add pre slash
    if (path !== '' && path[0] !== '/') path = `/${path}`;
    // remove trailing slash
    return path[path.length - 1] === '/' ? path.substring(0,path.length - 1) : path;
}