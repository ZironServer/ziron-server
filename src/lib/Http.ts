/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {TemplatedApp} from "ziron-ws";
import { ReplaceReturnType } from "./Utils";

type HttpFunctions = Pick<TemplatedApp,"any" | "get" | "post" | "put" | "del" | "head" | "patch" | "options" | "connect" | "trace">;
export type Http = {[K in keyof HttpFunctions]: ReplaceReturnType<HttpFunctions[K],void>}