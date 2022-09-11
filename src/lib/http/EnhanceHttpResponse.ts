/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpResponse as RawHttpResponse} from "ziron-ws";
import {createReadStream, statSync} from "fs";
import {lockupMimeType} from "./MimeLockup";
import {Writable} from "../Utils";

export const enum HttpResponseState {
    Available = 0,
    Reserved = 1,
    Aborted = 2,
    Ended = 3
}

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
     * The current state of the response can be either available, reserved, aborted or ended.
     * The response also provides the two getters: available and closed to check the state.
     * You should check if the response is still available whenever you want to use the response.
     * Especially after an async operation, the response might have been aborted in the meantime.
     */
    readonly state: HttpResponseState;
    /**
     * @description
     * Indicates if the response state is available.
     * It is important to check that the response is available whenever you want to use the response.
     * Especially after an async operation, the response might have been aborted in the meantime.
     */
    readonly available: boolean;
    /**
     * @description
     * Indicates if the response state is aborted or ended.
     * This getter can be helpful if you have reserved the response and
     * want to check if the response was not aborted or ended in
     * the meantime before each async write.
     * Notice that the available getter would return false because
     * the response state is reserved by yourself.
     */
    readonly closed: boolean;
    /**
     * @description
     * Reserves the response.
     * If it is ensured that the response will end async in this execution and
     * you want to avoid others from using the response,
     * the response can be reserved by using this function.
     * Notice to use the closed getter to check if the response is not ended or aborted
     * instead of the available getter because the available getter would return
     * false when the response state is reserved by yourself.
     */
    readonly reserve: () => void;
    /**
     * @description
     * Sends back a file and finishes the response.
     */
    readonly writeFile: (path: string,reqHeaders?: {
        'if-modified-since'?: string,
        range?: string,
        'accept-encoding'?: string
    },handleLastModified?: boolean) => Promise<void>;
    /**
     * @description
     * Sends a redirect to another location and finishes the response.
     */
    readonly redirect: (location: string) => void;
}

export default function enhanceHttpResponse(res: RawHttpResponse & Partial<HttpResponse>): HttpResponse {
    const originalEnd = res.end.bind(res);
    const originalTryEnd = res.tryEnd.bind(res);
    (res as Writable<HttpResponse>).state = HttpResponseState.Available;
    res.end = (...args) => {
        originalEnd(...args);
        (res as Writable<HttpResponse>).state = HttpResponseState.Ended;
        return res;
    };
    res.tryEnd = (...args) => {
        const [ok, done] = originalTryEnd(...args);
        if(done) (res as Writable<HttpResponse>).state = HttpResponseState.Ended;
        return [ok, done]
    };
    res.onAborted(() => {
        (res as Writable<HttpResponse>).state = HttpResponseState.Aborted;
    });
    Object.defineProperty(res,
        'available' as keyof HttpResponse,
        {get: () => res.state === HttpResponseState.Available}
    );
    Object.defineProperty(res,
        'closed' as keyof HttpResponse,
        {get: () => res.state === HttpResponseState.Ended || res.state === HttpResponseState.Aborted}
    );
    (res as Writable<HttpResponse>).reserve = () => {
        if(res.state !== HttpResponseState.Available) throw new Error("An unavailable response can not be reserved.");
        (res as Writable<HttpResponse>).state = HttpResponseState.Reserved;
    }
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
export async function sendFileToRes(res: HttpResponse,
                              path: string,
                              reqHeaders: {
                                  'if-modified-since'?: string,
                                  range?: string,
                                  'accept-encoding'?: string
                              } = {},
                              handleLastModified = true) : Promise<void>
{
    if(!res.available) throw new Error("A file can not be sent to an unavailable response.")
    res.reserve();

    let {mtime, size} = statSync(path);
    mtime.setMilliseconds(0);
    const mtimeUtc = mtime.toUTCString();

    if(handleLastModified) {
        if(reqHeaders['if-modified-since']) {
            if(new Date(reqHeaders['if-modified-since']) >= mtime) {
                res.cork(() => {
                    res.writeStatus('304 Not Modified');
                    res.end();
                });
                return;
            }
        }
        res.headers['last-modified'] = mtimeUtc;
    }
    res.headers['content-type'] = lockupMimeType(path);

    //write
    return new Promise((resolve,reject) => {
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
        res.onAborted(() => {
            readStream.destroy();
            reject(new Error("The request was aborted in the meantime."));
        });

        readStream.on('data', (buffer: Buffer) => {
            if(res.closed) return reject(new Error("The request was aborted in the meantime."));

            const chunk = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
                lastOffset = res.getWriteOffset();

            const [ok, done] = res.tryEnd(chunk, size);
            if(done) {
                readStream.destroy();
                resolve();
            }
            else if(!ok) {
                if(res.closed) return reject(new Error("The request was aborted in the meantime."));

                //Backpressure pause
                readStream.pause();

                //Save for later
                res.ab = chunk;
                res.abOffset = lastOffset;

                //Write on drain
                res.onWritable(offset => {
                    const [ok, done] = res.tryEnd(res.ab.slice(offset - res.abOffset), size);
                    if(done) {
                        readStream.destroy();
                        resolve();
                    }
                    else if(ok) readStream.resume();
                    return ok;
                });
            }
        }).on('error', (err) => {
            reject(new Error(`Stream error: ${err}.`));
            if(!res.closed) {
                res.cork(() => {
                    res.writeStatus('500 Internal server error');
                    res.end();
                });
            }
            readStream.destroy();
        });
        //Notice stream end event will not trigger because
        // the stream is destroyed when the response is done.
    });
}