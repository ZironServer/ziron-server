/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

export type Writable<T> = { -readonly [P in keyof T]: T[P] };

export function arrayContentEquals(array1: any[], array2: any[]) {
    if(array1.length !== array2.length) return false;
    for(let i = 0;  i < array1.length; i++)
        if(array1[i] !== array2[i]) return false;
    return true;
}

/**
 * Checks if a value is deep equal to another value.
 * @param v1
 * @param v2
 */
export function deepEqual(v1 : any, v2 : any) : boolean {
    if (v1 === v2) return true;
    if(typeof v1 === "object" && v1){
        if(typeof v2 === "object" && v2){
            if(Array.isArray(v1) && Array.isArray(v2)){
                if(v1.length !== v2.length) return false;
                for(let i = 0; i < v1.length; i++) if(!deepEqual(v1[i],v2[i])) return false;
                return true;
            }
            else {
                for (let k in v1) if(v1.hasOwnProperty(k) && !deepEqual(v1[k],v2[k])) return false;
                for (let k in v2) if(v2.hasOwnProperty(k) && !v1.hasOwnProperty(k)) return false;
                return true;
            }
        }
        else {
            return false;
        }
    }
    return false;
}

export function hashToIndex(key: string, size: number) {
    let hash = 0, chr, i;
    for (i = 0; i < key.length; i++) {
        chr = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash = hash & hash;
    }
    return Math.abs(hash) % size;
}

export const distinctArrayFilter = <T>(v: T, i: number, a: T[]) => a.indexOf(v) === i;

export function parseJoinToken(token: string): {secret: string, uri: string} {
    const joinTokenIndexOfAt = token.indexOf("@");
    if (joinTokenIndexOfAt === -1) return {
        uri: token,
        secret: ""
    }
    else return {
        secret: token.substring(0, joinTokenIndexOfAt),
        uri: token.substring(joinTokenIndexOfAt + 1)
    }
}