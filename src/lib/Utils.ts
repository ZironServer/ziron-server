/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {UpgradeHeaders} from "./http/UpgradeRequest";

export type Writable<T> = { -readonly [P in keyof T]: T[P] };

export function tryGetClientIpFromHeaders(headers: UpgradeHeaders): string | undefined {
    const xForwardedFor = headers.xForwardedFor;
    if(xForwardedFor) return xForwardedFor.split(',')[0].trim();
    return undefined;
}

export function preprocessPath(path: string): string {
    // add pre slash
    if (path !== '' && path[0] !== '/') path = `/${path}`;
    // remove trailing slashes
    return path.replace(/(\/)+$/,'');
}

/**
 * Ensures that any catched value is an instance of Error.
 * @param err 
 * @returns 
 */
export function ensureError(err: any): Error {
    if (err instanceof Error) return err;
    if (typeof err === 'string') return new Error(err);
    try {
        return new Error(String(err));
    } catch {
        return new Error('Unknown error');
    }
}