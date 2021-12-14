/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

export class FailedToListenError extends Error {
    constructor(public readonly port: number) {
        super(`Failed to listen on port: ${port}.`);
        this.name = "FailedToListenError";
    }
}