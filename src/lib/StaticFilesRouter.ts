/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpRequest} from "ziron-ws";
import {join,basename} from "path";
import {readdirSync, statSync, createReadStream} from 'fs';
import {lockupMimeType} from "./MimeLockup";
import {HttpResponse as HttpResponse} from "./EnhanceHttpResponse";

const BYTES_PREFIX = 'bytes=';

/**
 * @description
 * Simple helper class to serve static files.
 */
export default class StaticFilesRouter {

    private readonly files: Record<string,string> = {};

    /**
     * @description
     * Serves a static file.
     * @example
     * file("dist/style.css","/myStyles/styles.css")
     * @param pattern
     * @param file
     */
    file(file: string,pattern?: string) {
        if(!pattern) pattern = "/" + basename(file);
        else if(pattern[0] !== '/') pattern = '/' + pattern;

        if(this.files[pattern]) throw new Error(`Error pattern already used for file: ${this.files[pattern]}.`);
        this.files[pattern] = file;
    }

    /**
     * @description
     * Serves a folder recursive.
     * @example
     * folder("dist/assets","someAssets")
     * @param folder
     * @param urlPath
     * @param filter
     */
    folder(folder: string, urlPath: string = "", filter?: (file: string) => boolean) {
        if(!statSync(folder).isDirectory()) throw Error('Given folder path is not a directory: ' + folder);

        if(urlPath[0] !== '/') urlPath = '/' + urlPath;
        if(urlPath[urlPath.length - 1] === '/') urlPath = urlPath.slice(0, -1);

        readdirSync(folder).forEach(item => {
            const absolutePath = join(folder,item);
            if(statSync(absolutePath).isDirectory()) this.folder(absolutePath,`${urlPath}/${item}`);
            else if(!filter || filter(absolutePath)) this.file(absolutePath,`${urlPath}/${item}`);
        });
    }

    /**
     * @description
     * Handles the incoming request.
     * Returns if a file was found and served.
     * @param req
     * @param res
     */
    handle(req: HttpRequest,res: HttpResponse): boolean {
        const file = this.files[req.getUrl()];
        if(file != null) {
            this.sendFileToRes(res,
                {
                    'if-modified-since': req.getHeader('if-modified-since'),
                    range: req.getHeader('range'),
                    'accept-encoding': req.getHeader('accept-encoding')},
                file);
            return true;
        }
        else return false;
    }

    private sendFileToRes(res: HttpResponse,
                          reqHeaders: { [name: string]: string },
                          path: string,
                          handleLastModified = true
    )
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
}