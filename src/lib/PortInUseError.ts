/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

export class PortInUseError extends Error {
    constructor(port: number) {
        super(`The port ${port} is already in use.`);
        this.name = "PortInUseError";
    }
}