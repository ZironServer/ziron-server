/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import { secrets } from "docker-secret";
const variables = Object.assign({}, process.env, secrets);

const argv = process.argv[2];
const argvDefaultPort = argv && argv.startsWith('d-');
const argvPort = argvDefaultPort ? parseInt(argv.substring(2)) : parseInt(argv);
const defaultPort = argvDefaultPort ? (argvPort || 3000) : 3000;
const port = (!argvDefaultPort && argvPort) ? argvPort :
    parseInt(variables.PORT) || defaultPort;

(require("http")).request({
    host: "localhost",
    path: "/health",
    method: "GET",
    port,
    timeout: 2000
}, (res) => {
    process.exit(res.statusCode == 200 ? 0 : 1);
}).on('error', () => {
    process.exit(1);
}).end();