/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpRequest} from "ziron-ws";
import {join,basename} from "path";
import {readdirSync, statSync} from 'fs';
import {HttpResponse as HttpResponse} from "./EnhanceHttpResponse";

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
     * @param override
     */
    file(file: string,pattern?: string,override?: boolean) {
        if(!pattern) pattern = "/" + basename(file);
        else if(pattern[0] !== '/') pattern = '/' + pattern;

        if(!override && this.files[pattern] != null) throw new Error(`Error pattern already used for file: ${this.files[pattern]}.`);
        this.files[pattern] = file;
    }

    /**
     * @description
     * Serves a folder recursive.
     * @example
     * folder("dist/assets","someAssets")
     * @param folder
     * @param urlPath
     * @param options
     */
    folder(folder: string, urlPath: string = "", options: {
        filter?: (file: string) => boolean,
        linkIndex?: boolean
        override?: boolean
    } = {}) {
        if(options.linkIndex == null) options.linkIndex = true;

        if(!statSync(folder).isDirectory()) throw Error('Given folder path is not a directory: ' + folder);

        if(urlPath[0] !== '/') urlPath = '/' + urlPath;
        if(urlPath[urlPath.length - 1] === '/') urlPath = urlPath.slice(0, -1);

        readdirSync(folder).forEach(item => {
            const absolutePath = join(folder,item);
            if(statSync(absolutePath).isDirectory()) this.folder(absolutePath,`${urlPath}/${item}`,options);
            else if(!options.filter || options.filter(absolutePath)) {
                if(options.linkIndex && item.split('.')[0].toLowerCase() === 'index')
                    this.file(absolutePath,urlPath,options.override);
                this.file(absolutePath,`${urlPath}/${item}`,options.override);
            }
        });
    }

    /**
     * @description
     * Handles the incoming request.
     * Returns false when the response cannot be handled or a
     * truthy value when the response can be handled.
     * The truthy value is either a promise object
     * (that resolves when the file writing has been finished) or
     * a true bool value when a redirect response has been sent.
     * @param req
     * @param res
     */
    handle(req: HttpRequest,res: HttpResponse): boolean | Promise<void> {
        if(req.getMethod() === 'get') {
            const url = req.getUrl();
            const file = this.files[url];
            if(file != null) {
                return res.writeFile(file,{
                    'if-modified-since': req.getHeader('if-modified-since'),
                    range: req.getHeader('range'),
                    'accept-encoding': req.getHeader('accept-encoding')
                },true);
            }
            else if(url.endsWith("/") && this.files[url.slice(0,-1)] != null) {
                res.redirect(url.slice(0,-1));
                return true;
            }
        }
        return false;
    }
}