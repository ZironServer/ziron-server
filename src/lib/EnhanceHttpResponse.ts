/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpResponse as CoreHttpResponse} from "ziron-ws";

export type HttpResponse = Omit<CoreHttpResponse,'writeHeader'> & {
  headers: Record<string,string>;
  writeHeaders: () => void;
  aborted?: boolean;
  ended?: boolean;
};

export default function enhanceHttpResponse(res: CoreHttpResponse): HttpResponse {
    const originalEnd = res.end.bind(res);
    const originalTryEnd = res.tryEnd.bind(res);
    res.end = (...args) => {
        originalEnd(...args);
        res.ended = true;
        return res;
    };
    res.tryEnd = (...args) => {
        const [ok, done] = originalTryEnd(...args);
        res.ended = done;
        return [ok, done]
    };
    res.onAborted(() => {res.aborted = true;});
    res.writeHeaders = () => writeResponseHeaders(res,res.headers);
    res.headers = {};
    return res as unknown as HttpResponse;
}

/**
 * @description
 * Write response headers utility function.
 * @param res
 * @param headers
 */
export function writeResponseHeaders(res: CoreHttpResponse, headers: {[name: string]: string }) {
    res.cork(() => {
        for(const name in headers) res.writeHeader(name, headers[name].toString());
    });
}