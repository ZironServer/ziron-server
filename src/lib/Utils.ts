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