/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

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
            this.code = code || 4403;
        }
        this.message = message;
    }
}