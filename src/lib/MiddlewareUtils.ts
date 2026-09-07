/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

/**
 * @description
 * The default code of a block.
 * Codes from 4500 upwards are treated as permanent by the client,
 * so a blocked connection is not retried automatically.
 * Use a code below 4500 (e.g. 4403) for temporary blocks.
 */
export const DEFAULT_BLOCK_CODE = 4503;

export class Block {
    readonly code: number;
    readonly name?: string;
    readonly message?: string;

    toString() {return `${this.name} (${this.code}): ${this.message}`;}

    constructor()
    constructor(code: number | null, message?: string)
    constructor(name: string | null, message?: string, code?: number)
    constructor(nameOrCode?: string | number | null,message?: string, code?: number) {
        if(typeof nameOrCode === 'number') {
            this.name = 'MiddlewareBlock';
            this.code = nameOrCode;
        }
        else {
            this.name = nameOrCode || 'MiddlewareBlock';
            this.code = code || DEFAULT_BLOCK_CODE;
        }
        this.message = message;
    }
}