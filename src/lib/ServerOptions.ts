/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {AuthOptions}            from "./AuthEngine";

export default interface ServerOptions {
    state?: string | null,
    auth?: AuthOptions,
    allowClientPublish?: boolean,
    ackTimeout?: number,
    pingInterval?: number,
    /**
     * @default 12000ms
     */
    authTokenExpireCheckInterval?: number,
    maxPayload?: number | null,
    perMessageDeflate?: boolean | {
        serverNoContextTakeover: boolean;
    } | null,
    /**
     * The url path to the server.
     * @default '/ziron'
     */
    path?: string;
    /**
     * With this property, you can specify what origins are allowed to communicate to the server.
     * You can specify the port and hostname.
     * Also, a star can be used as a wild card for any port or any hostname.
     * @example
     * //allow all origins
     * origins: null, or
     * origins: '*:*',
     *
     * //allow all with hostname example.de
     * origins: 'example.de:*', or
     * origins: 'example.de'
     *
     * //allow all with port 80
     * origins: '*:80'
     *
     * //allow only hostname example.de on port 80
     * origins: 'example.de:80'
     *
     * //allow all with hostname example.de or example2.de
     * origins: ['example.de:*','example2.de']
     *
     * @default null (all allowed)
     */
    origins?: string[] | string | null
}