/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

export class Block {
    readonly code: number;
    readonly message?: string;
    constructor(code: number = 4403, message?: string) {
        this.code = code;
        this.message = message;
    }
}