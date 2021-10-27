/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import { secrets } from "docker-secret";
import {preprocessPath} from "./lib/Utils";
const variables = Object.assign({}, process.env, secrets);

const rawPortOption = process.argv[2];
const argvDefaultPort = rawPortOption && rawPortOption.startsWith('d-');
const argvPort = argvDefaultPort ? parseInt(rawPortOption.substring(2)) : parseInt(rawPortOption);
const defaultPort = argvDefaultPort ? (argvPort || 3000) : 3000;
const port = (!argvDefaultPort && argvPort) ? argvPort :
    parseInt(variables.PORT) || defaultPort;
const path = preprocessPath(process.argv[3] != null ? process.argv[3] : (variables.SERVER_PATH || ''));

(require("http")).request({
    host: "localhost",
    path: path + "/health",
    method: "GET",
    port,
    timeout: 2000
}, (res) => {
    process.exit(res.statusCode == 200 ? 0 : 1);
}).on('error', () => {
    process.exit(1);
}).end();