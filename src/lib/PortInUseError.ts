/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

export class PortInUseError extends Error {
    constructor(port: number) {
        super(`The port ${port} is already in use.`);
        this.name = "PortInUseError";
    }
}