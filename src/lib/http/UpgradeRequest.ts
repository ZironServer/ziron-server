/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpRequest} from "ziron-ws";

/**
 * @description
 * Notice that these headers are
 * only a limited set of all headers.
 */
export interface UpgradeHeaders {
    secWebSocketKey: string,
    secWebSocketProtocol: string,
    secWebSocketExtensions: string,
    origin: string,
    xForwardedFor: string
    xForwardedPort: string,
    acceptLanguage: string,
    userAgent: string
}

export default class UpgradeRequest<T = any> {

    readonly url: string;
    readonly query: string;
    readonly method: string;
    /**
     * @description
     * The attachment of the handshake.
     */
    readonly attachment: T;
    readonly headers: Readonly<UpgradeHeaders>;
    readonly signedToken: string | null;

    constructor(req: HttpRequest) {
        this.url = req.getUrl();
        this.method = req.getMethod();

        const protocol = decodeURIComponent(req.getHeader('sec-websocket-protocol') ?? '');
        const protocolIndexOfAt = protocol.indexOf('@');
        const protocolName = protocolIndexOfAt === -1 ? protocol : protocol.substring(protocolIndexOfAt + 1);

        this.signedToken = protocolIndexOfAt !== -1 ? protocol.substring(0,protocolIndexOfAt) : null;
        this.headers = {
            secWebSocketKey: req.getHeader('sec-websocket-key'),
            secWebSocketProtocol: protocolName,
            secWebSocketExtensions: req.getHeader('sec-websocket-extensions'),
            origin: req.getHeader("origin"),
            xForwardedFor: req.getHeader('x-forwarded-for'),
            xForwardedPort: req.getHeader('x-forwarded-port'),
            acceptLanguage: req.getHeader('accept-language'),
            userAgent: req.getHeader('user-agent')
        };
        this.query = req.getQuery();
        if(this.query.length){
            try {
                const parsedArgs = JSON.parse(decodeURIComponent(this.query));
                if(parsedArgs) this.attachment = parsedArgs;
            } catch (_) {}
        }
    }
}