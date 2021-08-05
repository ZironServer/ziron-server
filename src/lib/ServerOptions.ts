/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {AuthOptions} from "./AuthEngine";
import * as HTTP from "http";
import * as HTTPS from "https";

export default interface ServerOptions {
    /**
     * @description
     * The id of the server.
     * It's essential when joining a cluster.
     * @default
     * Auto-generated by using the package: "uniqid".
     */
    id?: string;
    /**
     * @description
     * Specifies the join token to the cluster.
     * This is required if you want to run a cluster.
     */
    join?: string | null;
    /**
     * @description
     * Specifies the auth options that are used to sign and verify JSON web tokens.
     */
    auth?: AuthOptions,
    /**
     * @description
     * Specifies if the client is allowed to publish into channels.
     * The PublishIn middleware will still be used to check access.
     */
    allowClientPublish?: boolean,
    /**
     * @description
     * Specifies the limit of channels a socket can subscribe.
     * Null means unlimited.
     * @default 1000
     */
    socketChannelLimit?: number | null,
    /**
     * @description
     * Specifies the default ack timeout.
     * @default 7000
     */
    ackTimeout?: number,
    /**
     * @description
     * Specifies the interval in that the server pings the client sockets.
     * The client sockets need to send a pong before the next ping
     * is sent otherwise the socket will be disconnected.
     */
    pingInterval?: number,
    /**
     * @description
     * The interval when the server checks the for expired auth tokens.
     * @default 12000ms
     */
    authTokenExpireCheckInterval?: number,
    /**
     * @description
     * Specifies the maximum allowed message size in bytes.
     * @default 16777216
     */
    maxPayload?: number | null,
    /**
     * @description
     * Enable/disable permessage-deflate.
     */
    perMessageDeflate?: boolean | { serverNoContextTakeover: boolean; } | null,
    /**
     * The port where the server is listening.
     * @default 3000
     */
    port?: number;
    /**
     * The URL path of the server where handshake requests are processed.
     * @default '/'
     */
    path?: string;
    /**
     * With this property, you can specify what origins are allowed to connect to the server.
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
    origins?: string[] | string | null;
    /**
     * Specifies if the server should automatically provide a health check HTTP endpoint.
     * @default true
     */
    healthCheckEndpoint?: boolean;
    /**
     * Defines payload that will be sent to the state server when a connection will be created.
     * @default {}
     */
    clusterJoinPayload?: Record<any, any>;
    /**
     * Defines an object that can be shared with all workers via the state server.
     * Notice, only the shared object from the first worker in the cluster will be actively used and shared.
     * It can be helpful to sync a secret between all workers.
     * @default {}
     */
    clusterShared?: Record<any, any>;
    /**
     * Defines an already existing HTTP server that should be used.
     * Notice that an error will be thrown when the provided server is already
     * listening to a different port than defined in the server options.
     * If no server is provided, a new one will be created.
     */
    httpServer?: HTTP.Server | HTTPS.Server | null;
}