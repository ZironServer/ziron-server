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

    constructor(code: number, message?: string)
    constructor(name: string ,message?: string, code?: number)
    constructor(nameOrCode: string | number,message?: string, code?: number) {
        if(typeof nameOrCode === 'number') {
            this.name = `MiddlewareBlock`;
            this.code = nameOrCode;
        }
        else {
            this.name = nameOrCode;
            this.code = code || 4403;
        }
        this.message = message;
    }
}