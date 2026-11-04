/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpRequest, HttpResponse} from "ziron-ws";

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
    /**
     * @description
     * The address of the TCP peer that sent the upgrade request,
     * as uWebSockets writes it (IPv6 in full, IPv4 possibly mapped into IPv6).
     * It is taken from the connection, never from a header;
     * behind a proxy it is the proxy's address.
     * Empty when it is unknown.
     */
    readonly peerAddress: string;
    /**
     * @description
     * The port of the TCP peer that sent the upgrade request.
     * 0 when it is unknown.
     */
    readonly peerPort: number;

    /**
     * @param req
     * @param res
     * The response of the upgrade request.
     * The peer is read from it, which must happen before the upgrade
     * because uWebSockets no longer knows the peer of an upgraded socket.
     */
    constructor(req: HttpRequest, res?: HttpResponse) {
        this.peerAddress = res ? Buffer.from(res.getRemoteAddressAsText()).toString() : '';
        this.peerPort = res ? res.getRemotePort() : 0;
        this.url = req.getUrl();
        this.method = req.getMethod();

        const protocolHeader = (req.getHeader('sec-websocket-protocol') ?? '').split(",");

        let signedToken: string | null = null;
        if(protocolHeader.length > 1) {
            try {signedToken = decodeURIComponent(protocolHeader[1]).trim();}
            catch (_) {signedToken = null;}
        }
        this.signedToken = signedToken;
        this.headers = {
            secWebSocketKey: req.getHeader('sec-websocket-key'),
            secWebSocketProtocol: (protocolHeader[0] ?? '').trim(),
            secWebSocketExtensions: req.getHeader('sec-websocket-extensions'),
            origin: req.getHeader("origin"),
            xForwardedFor: req.getHeader('x-forwarded-for'),
            xForwardedPort: req.getHeader('x-forwarded-port'),
            acceptLanguage: req.getHeader('accept-language'),
            userAgent: req.getHeader('user-agent')
        };
        this.query = req.getQuery() || "";
        if(this.query.length){
            try {
                const parsedArgs = JSON.parse(decodeURIComponent(this.query));
                if(parsedArgs) this.attachment = parsedArgs;
            } catch (_) {}
        }
    }
}