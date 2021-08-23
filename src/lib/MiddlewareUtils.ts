/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

export class Block {
    readonly code: number;
    readonly name?: string;
    readonly message?: string;

    toString() {return `${this.name} (${this.code}): ${this.message}`;}

    constructor(name: string = 'UnknownMiddlewareBlock',message?: string, code: number = 4403) {
        this.name = name;
        this.message = message;
        this.code = code;
    }
}