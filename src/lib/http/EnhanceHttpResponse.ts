/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpResponse as RawHttpResponse} from "ziron-ws";
import {createReadStream, statSync} from "fs";
import {lockupMimeType} from "./MimeLockup";
import {Writable} from "../Utils";

export interface HttpResponse extends RawHttpResponse {
    /**
     * @description
     * This object can be used to set the headers of the response.
     * Notice that writeHeaders must be called afterwards to write the headers from the object.
     */
    readonly headers: Record<string,string>;
    readonly writeHeader: any;
    /**
     * @description
     * Writes all headers from the headers object.
     * Optionally you can pass additional headers as the first parameter.
     */
    readonly writeHeaders: (extraHeaders?: Record<string,string>) => HttpResponse;
    /**
     * @description
     * Indicates if the response is aborted.
     * After waiting for some async operations,
     * you should check this property before using the response again.
     */
    readonly aborted?: boolean;
    /**
     * @description
     * Indicates whether the response ended successfully.
     * Note that you should not use the response if this property is true.
     */
    readonly ended?: boolean;
    /**
     * @description
     * Indicates whether the response is closed,
     * which means that it was either completed successfully or aborted.
     */
    readonly closed: boolean;
    /**
     * @description
     * Sends back a file and finishes the response.
     */
    readonly writeFile: (path: string,reqHeaders?: {
        'if-modified-since'?: string,
        range?: string,
        'accept-encoding'?: string
    },handleLastModified?: boolean) => void;
    /**
     * @description
     * Sends a redirect to another location and finishes the response.
     */
    readonly redirect: (location: string) => void;
}

export default function enhanceHttpResponse(res: RawHttpResponse & Partial<HttpResponse>): HttpResponse {
    const originalEnd = res.end.bind(res);
    const originalTryEnd = res.tryEnd.bind(res);
    res.end = (...args) => {
        originalEnd(...args);
        (res as Writable<HttpResponse>).ended = true;
        return res;
    };
    res.tryEnd = (...args) => {
        const [ok, done] = originalTryEnd(...args);
        (res as Writable<HttpResponse>).ended = done;
        return [ok, done]
    };
    res.onAborted(() => {
        (res as Writable<HttpResponse>).aborted = true;
    });
    Object.defineProperty(res,
        'closed' as keyof HttpResponse,
        {get: () => !!(res.ended || res.aborted)}
    );
    (res as Writable<HttpResponse>).headers = {};
    (res as Writable<HttpResponse>).writeHeaders = (extraHeaders) => {
        if(extraHeaders) Object.assign(res.headers,extraHeaders);
        writeResponseHeaders(res,res.headers);
        return res as HttpResponse;
    };
    (res as Writable<HttpResponse>).writeFile = (path,reqHeaders,handleLastModified) =>
        sendFileToRes(res as unknown as HttpResponse,path,reqHeaders,handleLastModified);
    (res as Writable<HttpResponse>).redirect = (location) => writeResponseRedirection(res,location);
    return res as unknown as HttpResponse;
}

/**
 * @description
 * Write response headers utility function.
 * @param res
 * @param headers
 */
export function writeResponseHeaders(res: RawHttpResponse, headers: {[name: string]: string } = {}) {
    res.cork(() => {
        for(const name in headers) res.writeHeader(name, headers[name].toString());
    });
}

/**
 * @description
 * Redirects to another location.
 * @param res
 * @param location
 */
export function writeResponseRedirection(res: RawHttpResponse,location: string) {
    res.cork(() => {
        res.writeStatus("302 Found");
        res.headers['Location'] = location;
        res.writeHeaders();
        res.end();
    });
}

const BYTES_PREFIX = 'bytes=';

/**
 * @description
 * Streams a file in a response.
 * Also handles last modified.
 * @param res
 * @param path
 * @param reqHeaders
 * @param handleLastModified
 */
export function sendFileToRes(res: HttpResponse,
                              path: string,
                              reqHeaders: {
                                  'if-modified-since'?: string,
                                  range?: string,
                                  'accept-encoding'?: string
                              } = {},
                              handleLastModified = true)
{
    if(res.aborted) return;

    let {mtime, size} = statSync(path);
    mtime.setMilliseconds(0);
    const mtimeUtc = mtime.toUTCString();

    if(handleLastModified) {
        if(reqHeaders['if-modified-since']) {
            if(new Date(reqHeaders['if-modified-since']) >= mtime) {
                return res.cork(() => {
                    res.writeStatus('304 Not Modified');
                    res.end();
                })
            }
        }
        res.headers['last-modified'] = mtimeUtc;
    }
    res.headers['content-type'] = lockupMimeType(path);

    //write
    let start = 0, end = size - 1;
    if(reqHeaders.range) {
        const parts = reqHeaders.range.replace(BYTES_PREFIX, '').split('-');
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : end;
        res.headers['accept-ranges'] = 'bytes';
        res.headers['content-range'] = `bytes ${start}-${end}/${size}`;
        size = end - start + 1;
        res.writeStatus('206 Partial Content');
    }

    if(end < 0) end = 0;
    const readStream = createReadStream(path,{start, end});

    res.writeHeaders();
    res.onAborted(() => {readStream.destroy();});

    readStream.on('data', (buffer: Buffer) => {
        if(res.aborted) return;

        const chunk = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            lastOffset = res.getWriteOffset();

        const [ok, done] = res.tryEnd(chunk, size);
        if(done) readStream.destroy();
        else if(!ok) {
            if(res.aborted) return;

            //Backpressure pause
            readStream.pause();

            //Save for later
            res.ab = chunk;
            res.abOffset = lastOffset;

            //Write on drain
            res.onWritable(offset => {
                const [ok, done] = res.tryEnd(res.ab.slice(offset - res.abOffset), size);
                if(done) readStream.destroy();
                else if(ok) readStream.resume();
                return ok;
            });
        }
    }).on('error', () => {
        if(!res.ended && !res.aborted) {
            res.cork(() => {
                res.writeStatus('500 Internal server error');
                res.end();
            });
        }
        readStream.destroy();
    });
    //Notice stream end event will not trigger because
    // the stream is destroyed when the response is done.
}