/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpRequest as RawHttpRequest} from "ziron-ws";
import {Writable} from "../Utils";

export interface HttpRequest extends RawHttpRequest {
    /**
     * @description
     * Returns the requested path (always includes a prefix slash).
     */
    readonly getPath: () => string;
}

export default function enhanceHttpRequest(req: RawHttpRequest & Partial<HttpRequest>): HttpRequest {
    const path = req.getUrl().split('?')[0].split('#')[0];
    (req as Writable<HttpRequest>).getPath = () => path;
    return req as unknown as HttpRequest;
}