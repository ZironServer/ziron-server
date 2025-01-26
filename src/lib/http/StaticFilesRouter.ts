/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {HttpRequest} from "ziron-ws";
import {join,basename} from "path";
import {readdirSync, statSync} from 'fs';
import {HttpResponse as HttpResponse} from "./EnhanceHttpResponse";
import {lockupMimeType} from "./MimeLockup";

/**
 * @description
 * Simple helper class to serve static files.
 */
export default class StaticFilesRouter {

    private readonly files: Record<string,{path: string, contentType: string | null}> = {};
    //Custom content type extension map.
    //The key is the extension in lowercase and the 
    //value is the corresponding content type.
    public customContentTypeResolutionMap: Record<string,string> = {};

    /**
     * @description
     * Serves a static file.
     * @example
     * file("dist/style.css","/myStyles/styles.css")
     * @param pattern
     * @param filePath
     * @param override
     */
    file(filePath: string,pattern?: string,override?: boolean) {
        if(!pattern) pattern = "/" + basename(filePath);
        else if(pattern[0] !== '/') pattern = '/' + pattern;

        if(!override && this.files[pattern] != null) throw new Error(`Error pattern already used for file: ${this.files[pattern]}.`);
        this.files[pattern] = {path: filePath,contentType: lockupMimeType(filePath,this.customContentTypeResolutionMap)};
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
     * The truthy value is a promise and rejected errors needs to be handled.
     * It resolves when the file writing has been finished or 
     * is resolved on a redirect.
     * @param req
     * @param res
     */
    handle(req: HttpRequest,res: HttpResponse): false | Promise<void> {
        if(req.getMethod() === 'get') {
            const url = decodeURI(req.getUrl());
            const file = this.files[url];
            if(file != null) {
                if(file.contentType != null) 
                    res.headers['content-type'] = file.contentType;
                return res.writeFile(file.path,{
                    'if-modified-since': req.getHeader('if-modified-since'),
                    range: req.getHeader('range'),
                    'accept-encoding': req.getHeader('accept-encoding')
                },true);
            }
            else if(url.endsWith("/") && this.files[url.slice(0,-1)] != null) {
                res.redirect(url.slice(0,-1));
                return Promise.resolve();
            }
        }
        return false;
    }
}