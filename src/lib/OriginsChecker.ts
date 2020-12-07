/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {URL} from "url";

export type OriginsChecker = (origin?: string) => boolean;

/**
 * Create a closure to check origin and process origins.
 * @param validOrigins
 */
export function createOriginsChecker(validOrigins: string[] | string | null): OriginsChecker
{
    let origins: string[];
    if(validOrigins !== null){
        origins = Array.isArray(validOrigins) ? validOrigins: [validOrigins];
    }
    else {
        return () => true;
    }

    for(let i = 0; i < origins.length; i++) {
        if(origins[i] ===  '*:*') {
            return () => true;
        }
        if(origins[i].indexOf(':') === -1){
            origins[i] = origins[i] + ':*';
        }
    }

    const originsLength = origins.length;
    return (origin) => {
        if(!origin) return false;
        let ok: boolean = false;
        try {
            const url = new URL(origin);
            const port = url.port || (url.protocol === 'https:' ? '443': '80');
            for(let i = 0; i < originsLength; i++) {
                ok = origins[i] === (url.hostname + ':' + port) ||
                    origins[i] === (url.hostname + ':*') ||
                    origins[i] === ('*:' + url.port);
                if(ok) break;
            }
        }
        catch (_) {}
        return ok;
    }
}

